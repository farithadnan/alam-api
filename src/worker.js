/**
 * Alam — Cloudflare Worker (single origin: SPA static assets + the read API).
 *
 * The dashboard build (../udara-dashboard/dist) is served by the platform as static
 * assets ([assets] in wrangler.toml); requests that do NOT match a file (i.e. /api/*,
 * /health, unknown routes) land here. So the SPA and the API share one origin, exactly as
 * the VPS Fastify app served them, and the dashboard's `VITE_API_URL=""` (same-origin)
 * works unchanged.
 *
 * Phase 0 minimal slice: /health, /api/summary, /api/hazards proven against D1.
 * Route parity (current/history/forecast/stations/official/news/haze/flood + /v1 alias)
 * lands in Phase 1 by moving the rest of src/http/server.ts behind route().
 */
import { D1Store } from "./store/d1-store.js";
import { aqiBand } from "./core/bands.js";
import { groupWarnings } from "./core/warnings.js";
import { MALAYSIA_LOCALITIES } from "./core/localities.js";
import { LATEST_LIMIT, NEWS_LIMIT, QUAKE_LIMIT } from "./core/constants.js";

const decorate = (o) =>
  o.kind === "aqi" && o.source === "doe-eqms" ? { ...o, band: aqiBand(o.value) } : o;

const apiIndex = () => ({
  name: "Alam API",
  version: "v1",
  note: "Free, public, no key. Please cache; data refreshes every few minutes.",
  endpoints: [
    "/api/summary", "/api/current", "/api/history", "/api/forecast", "/api/stations",
    "/api/hazards", "/api/flood", "/api/news", "/api/official", "/api/haze",
  ],
});

const json = (body, status = 200, cache = "") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(cache ? { "cache-control": cache } : {}),
    },
  });

const quakeView = (q) => ({ source: q.source, station: q.station, stationName: q.stationName, measuredAt: q.measuredAt, magnitude: q.value, meta: q.meta ?? null });
const warningView = (w) => ({ source: w.source, station: w.station, title: w.stationName, severity: w.value, measuredAt: w.measuredAt, meta: w.meta ?? null });

async function route(method, path, params, env) {
  const store = new D1Store(env.DB);

  if (method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (path === "/health") return json({ ok: true, t: new Date().toISOString() });

  // Normalise /api/summary, /api, /api/, and the /v1 alias.
  let api = path.replace(/^\/v1/, "/api").replace(/^\/api\/?/, "");
  api = api.replace(/\/$/, "");

  if (api === "") return json(apiIndex());
  if (api === "summary") {
    const state = params.get("state") || "";
    const inState = (rows) => (state ? rows.filter((r) => r.meta?.state === state) : rows);
    const [aqi, weather, earthquakes, warnings, news, climate] = await Promise.all([
      store.latestBySource("doe-eqms").then((r) => inState(r.map(decorate))),
      store.latestBySource("open-meteo").then((r) => inState(r.filter((x) => x.kind !== "haze"))),
      store.latestByKind("quake", QUAKE_LIMIT).then((rs) => rs.map(quakeView)),
      store.latestByKind("warning", LATEST_LIMIT).then((rs) => groupWarnings(rs.map(warningView))),
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
    ]);
    const stations = aqi.map((s) => {
      const loc = MALAYSIA_LOCALITIES.find((l) => l.slug === s.station);
      return { ...s, coords: loc ? { lat: loc.lat, lon: loc.lon } : null };
    });
    const allTowns = MALAYSIA_LOCALITIES.map((l) => ({ station: l.slug, name: l.name, state: l.state }));
    return json(
      { states: [...new Set([...aqi, ...weather].map((r) => r.meta?.state).filter(Boolean))], allTowns, stations, weather, news, hazards: { warnings, earthquakes, climate }, ts: new Date().toISOString() },
      200, "public, max-age=120, stale-while-revalidate=600",
    );
  }

  if (api === "hazards") {
    const [earthquakes, climate, warnings] = await Promise.all([
      store.latestByKind("quake", QUAKE_LIMIT).then((rs) => rs.map(quakeView)),
      store.latestBySource("oni").then((r) => r[0] ?? null),
      store.latestByKind("warning", LATEST_LIMIT).then((rs) => groupWarnings(rs.map(warningView))),
    ]);
    return json({ earthquakes, climate, warnings, timestamp: new Date().toISOString() });
  }

  return json({ error: "not_found", path }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    return route(request.method, url.pathname, url.searchParams, env);
  },
};
