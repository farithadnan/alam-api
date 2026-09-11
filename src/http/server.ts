import Fastify from "fastify";
import cors from "@fastify/cors";
import type { Store, ObservationRow } from "../store/db.js";
import { aqiBand } from "../core/bands.js";
import { MALAYSIA_LOCALITIES } from "../core/localities.js";
import { MALAYSIA_STATES } from "../core/states.js";

/** Approximate a monitoring station's position: match to a known locality, else state centroid. */
function stationCoords(name: string, stateName?: string | null): { lat: number; lon: number } | null {
  const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const n = slug(name);
  const hit =
    MALAYSIA_LOCALITIES.find((l) => slug(l.name) === n) ||
    MALAYSIA_LOCALITIES.find((l) => l.slug === n) ||
    MALAYSIA_LOCALITIES.find((l) => slug(l.name).includes(n) || n.includes(slug(l.name)));
  if (hit) return { lat: hit.lat, lon: hit.lon };
  if (stateName) {
    const st = MALAYSIA_LOCALITIES.filter((l) => l.state === stateName);
    if (st.length) return { lat: st.reduce((a, l) => a + l.lat, 0) / st.length, lon: st.reduce((a, l) => a + l.lon, 0) / st.length };
  }
  return null;
}


function decorate(o: ObservationRow) {
  // Only DOE eqms emits the Malaysia APIMS scale; Open-Meteo's us_aqi is a different
  // (US 500-pt) scale and must not be band-labelled with the Malaysian bands.
  const band = o.kind === "aqi" && o.source === "doe-eqms" ? aqiBand(o.value) : undefined;
  return { ...o, band };
}

const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 120);

export function buildServer(store: Store) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    // `/v1/*` is a stable public alias of `/api/*` — one implementation, two paths.
    rewriteUrl: (req) => (req.url ?? "").replace(/^\/v1\//, "/api/"),
  });
  app.register(cors, { origin: true });

  // In-memory rate limit (per IP, fixed 60s window). Enough for a single free node;
  // swap for @fastify/rate-limit + a shared store if this ever scales out.
  const buckets = new Map<string, { n: number; reset: number }>();
  app.addHook("onRequest", async (req, reply) => {
    const url = req.raw.url ?? "";
    if (!/\/(api|v1)\//.test(url)) return;
    const now = Date.now();
    let b = buckets.get(req.ip);
    if (!b || b.reset < now) {
      b = { n: 0, reset: now + 60_000 };
      buckets.set(req.ip, b);
    }
    b.n++;
    reply.header("X-RateLimit-Limit", RATE_LIMIT_PER_MIN);
    reply.header("X-RateLimit-Remaining", Math.max(0, RATE_LIMIT_PER_MIN - b.n));
    if (b.n > RATE_LIMIT_PER_MIN) {
      const retry = Math.ceil((b.reset - now) / 1000);
      reply.header("Retry-After", retry);
      return reply.code(429).send({ error: "rate_limited", detail: `Limit ${RATE_LIMIT_PER_MIN} requests/min. Retry after ${retry}s.` });
    }
  });

  app.get("/health", async () => ({ ok: true, t: new Date().toISOString() }));

  /** Self-describing index so the public API is discoverable. */
  app.get("/api", async () => ({
    name: "Alam API",
    version: "v1",
    note: "Free, public, no key. Please cache; data refreshes every few minutes.",
    rateLimit: `${RATE_LIMIT_PER_MIN} requests/min per IP`,
    endpoints: [
      "/api/summary?state=<State>",
      "/api/current?source=doe-eqms",
      "/api/history?source=doe-eqms&station=<id>&hours=24",
      "/api/forecast?source=open-meteo",
      "/api/stations",
      "/api/hazards",
      "/api/news",
    ],
    alias: "/v1/* mirrors /api/*",
  }));

  app.get("/api/stations", async () => {
    return { stations: store.stations() };
  });

  app.get("/api/current", async (req) => {
    const q = req.query as { source?: string };
    const source = q.source ?? "doe-eqms";
    return { source, current: store.latestBySource(source).map(decorate) };
  });

  app.get("/api/history", async (req) => {
    const q = req.query as { source?: string; station?: string; hours?: string };
    const source = q.source ?? "doe-eqms";
    if (!q.station) return { error: "missing `station`" };
    const hours = Math.min(Math.max(Number(q.hours ?? 24) || 24, 1), 24 * 14);
    const since = new Date(Date.now() + 8 * 3_600_000 - hours * 3_600_000).toISOString().slice(0, 19);
    return { history: store.history(source, q.station, since) };
  });

  app.get("/api/forecast", async (req) => {
    const q = req.query as { source?: string };
    const source = q.source ?? "open-meteo";
    return { forecast: store.forecast(source) };
  });

  // Single cached bundle for the dashboard: stations + weather + forecast (optionally per state)
  // + national hazards. One round-trip instead of four, all read from the snapshot store.
  app.get("/api/summary", async (req, reply) => {
    reply.header("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
    const q = req.query as { state?: string; town?: string };
    const state = q.state || "";
    const town = q.town || "";
    const inState = (rows: ObservationRow[]) => (state ? rows.filter((r) => r.meta?.state === state) : rows);
    const stationBase = inState(store.latestBySource("doe-eqms").map(decorate));
    const since24 = new Date(Date.now() + 8 * 3_600_000 - 24 * 3_600_000).toISOString().slice(0, 19);
    // Per-day series for every station would dwarf the payload; the chart fetches
    // /api/history on demand. Only a compact trend rides along here.
    const stations = stationBase.map((s) => ({
      ...s,
      coords:
        s.meta?.lat != null && s.meta?.lon != null
          ? { lat: s.meta.lat as number, lon: s.meta.lon as number }
          : stationCoords(s.stationName, s.meta?.state as string | null | undefined),
      trend: store.history("doe-eqms", s.station, since24).map((r) => r.value),
    }));
    const weather = inState(store.latestBySource("open-meteo")).map((r) => {
      const loc = MALAYSIA_LOCALITIES.find((l) => l.slug === r.station);
      return { ...r, coords: loc ? { lat: loc.lat, lon: loc.lon } : null };
    });
    // Forecast + hourly are shown for ONE town at a time — send only that town's.
    const byTown = (rows: ObservationRow[]) => (town ? rows.filter((r) => r.station === town) : []);
    const forecast = byTown(inState(store.forecast("open-meteo")));
    const hourly = byTown(inState(store.hourly("open-meteo")));
    const earthquakes = store.latestByKind("quake", 20).map((qk) => ({
      source: qk.source, station: qk.station, stationName: qk.stationName, measuredAt: qk.measuredAt, magnitude: qk.value, meta: qk.meta ?? null,
    }));
    const warnings = store.latestByKind("warning", 20).map((w) => ({
      source: w.source, station: w.station, title: w.stationName, severity: w.value, measuredAt: w.measuredAt, meta: w.meta ?? null,
    }));
    const news = (() => {
      const seen = new Set<string>();
      const out: { title: string; url: string | null; outlet: string | null; publishedAt: string }[] = [];
      for (const n of store.latestByKind("news", 40)) {
        const url = (n.meta?.url as string) ?? null;
        if (url && seen.has(url)) continue;
        if (url) seen.add(url);
        out.push({ title: n.stationName, url, outlet: (n.meta?.outlet as string) ?? null, publishedAt: n.measuredAt });
        if (out.length >= 15) break;
      }
      return out;
    })();
    const climate = store.latestBySource("oni")[0] ?? null;
    const states = [
      ...new Set([
        ...store.latestBySource("doe-eqms").map((r) => r.meta?.state),
        ...store.latestBySource("open-meteo").map((r) => r.meta?.state),
      ].filter(Boolean)),
    ];
    const allTowns = MALAYSIA_LOCALITIES.map((l) => ({ station: l.slug, name: l.name, state: l.state }));
    return { states, allTowns, stations, weather, forecast, hourly, news, hazards: { warnings, earthquakes, climate }, ts: new Date().toISOString() };
  });

  app.get("/api/hazards", async () => {
    const earthquakes = store.latestByKind("quake", 20).map((q) => ({
      source: q.source,
      station: q.station,
      stationName: q.stationName,
      measuredAt: q.measuredAt,
      magnitude: q.value,
      meta: q.meta ?? null,
    }));
    const climate = store.latestBySource("oni")[0] ?? null;
    const warnings = store.latestByKind("warning", 20).map((w) => ({
      source: w.source,
      station: w.station,
      title: w.stationName,
      severity: w.value,
      measuredAt: w.measuredAt,
      meta: w.meta ?? null,
    }));
    return { earthquakes, climate, warnings, timestamp: new Date().toISOString() };
  });

  /** MET Malaysia's official district forecast, mapped to a state via the locality registry. */
  app.get("/api/official", async (req) => {
    const q = req.query as { state?: string; district?: string };
    const ALIAS: Record<string, string> = {
      penang: "Pulau Pinang", "pulau pinang": "Pulau Pinang",
      "kuala lumpur": "Kuala Lumpur", kl: "Kuala Lumpur",
      labuan: "Labuan", "wp labuan": "Labuan", putrajaya: "Putrajaya",
      malacca: "Melaka", "negeri sembilan": "Negeri Sembilan", "n. sembilan": "Negeri Sembilan",
    };
    const stateOf = (name: string): string | null => {
      const n = name.trim().toLowerCase();
      const hit =
        MALAYSIA_LOCALITIES.find((l) => l.name.toLowerCase() === n) ||
        MALAYSIA_LOCALITIES.find((l) => l.name.toLowerCase().includes(n) || n.includes(l.name.toLowerCase()));
      if (hit) return hit.state;
      const state = MALAYSIA_STATES.find((s) => s.name.toLowerCase() === n);
      return state?.name ?? ALIAS[n] ?? null;
    };
    const rows = store.metForecast().map((r) => ({
      district: r.stationName,
      state: stateOf(r.stationName),
      date: r.measuredAt.slice(0, 10),
      summary: (r.meta?.summary as string) ?? null,
      when: (r.meta?.when as string) ?? null,
      morning: (r.meta?.morning as string) ?? null,
      afternoon: (r.meta?.afternoon as string) ?? null,
      night: (r.meta?.night as string) ?? null,
      tmin: (r.meta?.tmin as number) ?? null,
      tmax: (r.meta?.tmax as number) ?? null,
    }));
    const filtered = rows.filter(
      (r) => (!q.state || r.state === q.state) && (!q.district || r.district.toLowerCase() === q.district.toLowerCase()),
    );
    return { official: filtered, districts: [...new Set(rows.map((r) => r.district))] };
  });

  app.get("/api/news", async () => ({
    news: store.latestByKind("news", 30).map((n) => ({
      title: n.stationName,
      url: n.meta?.url ?? null,
      outlet: n.meta?.outlet ?? null,
      publishedAt: n.measuredAt,
    })),
  }));

  return app;
}
