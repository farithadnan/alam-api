/**
 * Alam read API — Cloudflare Pages Functions.
 *
 * Phase 0 minimal slice to prove the pattern (D1-backed, single-origin). Route parity
 * (current/history/forecast/stations/official/news/haze/flood + /v1 alias) lands in
 * Phase 1 by moving the rest of `src/http/server.ts` here behind this same dispatch.
 */
import { D1Store } from "../../src/store/d1-store.js";
import { aqiBand } from "../../src/core/bands.js";
import { groupWarnings } from "../../src/core/warnings.js";
import { MALAYSIA_LOCALITIES } from "../../src/core/localities.js";
import { LATEST_LIMIT, NEWS_LIMIT, QUAKE_LIMIT } from "../../src/core/constants.js";

function decorate(o) {
  return o.kind === "aqi" && o.source === "doe-eqms" ? { ...o, band: aqiBand(o.value) } : o;
}

const apiIndex = () => ({
  name: "Alam API",
  version: "v1",
  note: "Free, public, no key. Please cache; data refreshes every few minutes.",
  endpoints: [
    "/api/summary", "/api/current", "/api/history", "/api/forecast", "/api/stations",
    "/api/hazards", "/api/flood", "/api/news", "/api/official", "/api/haze",
  ],
});

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const store = new D1Store(env.DB);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");

  const json = (body, status = 200, cache = "") =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
        ...(cache ? { "cache-control": cache } : {}),
      },
    });

  if (path === "health") return json({ ok: true, t: new Date().toISOString() });
  if (path === "" || path === "api") return json(apiIndex());

  if (path === "summary") {
    const state = url.searchParams.get("state") || "";
    const inState = (rows) => (state ? rows.filter((r) => r.meta?.state === state) : rows);
    const [aqi, weather, earthquakes, warnings, news, climate, metWarnings, allForecast] =
      await Promise.all([
        store.latestBySource("doe-eqms").then((r) => inState(r.map(decorate))),
        store.latestBySource("open-meteo").then((r) => inState(r.filter((x) => x.kind !== "haze"))),
        store.latestByKind("quake", QUAKE_LIMIT).then((rs) =>
          rs.map((q) => ({ source: q.source, station: q.station, stationName: q.stationName, measuredAt: q.measuredAt, magnitude: q.value, meta: q.meta ?? null })),
        ),
        store.latestByKind("warning", LATEST_LIMIT).then((rs) =>
          groupWarnings(rs.map((w) => ({ source: w.source, station: w.station, title: w.stationName, severity: w.value, measuredAt: w.measuredAt, meta: w.meta ?? null }))),
        ),
        store.latestByKind("news", NEWS_LIMIT * 3).then((rows) => {
          const seen = new Set(); const out = [];
          for (const n of rows) {
            const u = n.meta?.url ?? null;
            if (u && seen.has(u)) continue;
            if (u) seen.add(u);
            out.push({ title: n.stationName, url: u, outlet: n.meta?.outlet ?? null, publishedAt: n.measuredAt });
            if (out.length >= NEWS_LIMIT) break;
          }
          return out;
        }),
        store.latestBySource("oni").then((r) => r[0] ?? null),
        store.metForecast(),
        store.forecast("open-meteo"),
      ]);

    const stations = aqi.map((s) => {
      const loc = MALAYSIA_LOCALITIES.find((l) => l.slug === s.station);
      return { ...s, coords: loc ? { lat: loc.lat, lon: loc.lon } : null };
    });
    const allTowns = MALAYSIA_LOCALITIES.map((l) => ({ station: l.slug, name: l.name, state: l.state }));
    void allForecast; void metWarnings; // carried into full parity in Phase 1
    return json(
      { states: [...new Set([...aqi, ...weather].map((r) => r.meta?.state).filter(Boolean))], allTowns, stations, weather, news, hazards: { warnings, earthquakes, climate }, ts: new Date().toISOString() },
      200,
      "public, max-age=120, stale-while-revalidate=600",
    );
  }

  if (path === "hazards") {
    const [earthquakes, climate, warnings] = await Promise.all([
      store.latestByKind("quake", QUAKE_LIMIT).then((rs) => rs.map((q) => ({ source: q.source, station: q.station, stationName: q.stationName, measuredAt: q.measuredAt, magnitude: q.value, meta: q.meta ?? null }))),
      store.latestBySource("oni").then((r) => r[0] ?? null),
      store.latestByKind("warning", LATEST_LIMIT).then((rs) => groupWarnings(rs.map((w) => ({ source: w.source, station: w.station, title: w.stationName, severity: w.value, measuredAt: w.measuredAt, meta: w.meta ?? null })))),
    ]);
    return json({ earthquakes, climate, warnings, timestamp: new Date().toISOString() });
  }

  return json({ error: "not_found", path }, 404);
}

export async function onRequestPost() {
  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405, headers: { "content-type": "application/json" },
  });
}
