
import { districtFor } from "../core/townDistricts.js";import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import type { Store, ObservationRow } from "../store/db.js";
import { aqiBand } from "../core/bands.js";
import { WHO_PM25_24H } from "../core/haze.js";
import { groupWarnings } from "../core/warnings.js";
import { MALAYSIA_LOCALITIES } from "../core/localities.js";
import { MALAYSIA_STATES } from "../core/states.js";
import { MY_OFFSET_MS, LATEST_LIMIT, NEWS_LIMIT, QUAKE_LIMIT } from "../core/constants.js";

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


/** Shared projections so summary + hazards can never drift apart. */
function quakeView(q: ObservationRow) {
  return { source: q.source, station: q.station, stationName: q.stationName, measuredAt: q.measuredAt, magnitude: q.value, meta: q.meta ?? null };
}
function warningView(w: ObservationRow) {
  return { source: w.source, station: w.station, title: w.stationName, severity: w.value, measuredAt: w.measuredAt, meta: w.meta ?? null };
}

function decorate(o: ObservationRow) {
  // Only DOE eqms emits the Malaysia APIMS scale; Open-Meteo's us_aqi is a different
  // (US 500-pt) scale and must not be band-labelled with the Malaysian bands.
  const band = o.kind === "aqi" && o.source === "doe-eqms" ? aqiBand(o.value) : undefined;
  return { ...o, band };
}

const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 120);

export function buildServer(store: Store, dashboardDist = "") {
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

  /** Self-describing index so the public API is discoverable. Served at both `/` and `/api`. */
  const apiIndex = () => ({
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
      "/api/flood",
      "/api/news",
    ],
    alias: "/v1/* mirrors /api/*",
  });

  // Bare "/" (an alert-link or tunnel visit): serve the dashboard when one is
  // configured, else the API index so the URL never 404s.
  if (!dashboardDist) app.get("/", async () => apiIndex());
  app.get("/api", async () => apiIndex());

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
    const since = new Date(Date.now() + MY_OFFSET_MS - hours * 3_600_000).toISOString().slice(0, 19);
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
    const q = req.query as { state?: string; town?: string; towns?: string };
    const state = q.state || "";
    const town = q.town || "";
    // `town` = the saved location, `towns` = extra places being inspected (comma-separated).
    const wanted = new Set([town, ...(q.towns ?? "").split(",")].map((t) => t.trim()).filter(Boolean));
    const inState = (rows: ObservationRow[]) => (state ? rows.filter((r) => r.meta?.state === state) : rows);
    const stationBase = inState(store.latestBySource("doe-eqms").map(decorate));
    const since24 = new Date(Date.now() + MY_OFFSET_MS - 24 * 3_600_000).toISOString().slice(0, 19);
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
    // Haze has its own endpoint, so it is kept out of this bundle (the client filters
    // by kind anyway; this keeps the payload honest about what each row is).
    const weather = inState(store.latestBySource("open-meteo"))
      .filter((r) => r.kind !== "haze")
      .map((r) => {
      const loc = MALAYSIA_LOCALITIES.find((l) => l.slug === r.station);
      return { ...r, coords: loc ? { lat: loc.lat, lon: loc.lon } : null };
    });
    // Forecast + hourly are shown for ONE town at a time — send only that town's.
    const byTown = (rows: ObservationRow[]) => (wanted.size ? rows.filter((r) => wanted.has(r.station)) : []);
    const forecast = byTown(inState(store.forecast("open-meteo")));
    const hourly = byTown(inState(store.hourly("open-meteo")));
    const earthquakes = store.latestByKind("quake", QUAKE_LIMIT).map(quakeView);
    const warnings = groupWarnings(store.latestByKind("warning", LATEST_LIMIT).map(warningView));
    const news = (() => {
      const seen = new Set<string>();
      const out: { title: string; url: string | null; outlet: string | null; publishedAt: string }[] = [];
      for (const n of store.latestByKind("news", NEWS_LIMIT * 3)) {
        const url = (n.meta?.url as string) ?? null;
        if (url && seen.has(url)) continue;
        if (url) seen.add(url);
        out.push({ title: n.stationName, url, outlet: (n.meta?.outlet as string) ?? null, publishedAt: n.measuredAt });
        if (out.length >= NEWS_LIMIT) break;
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
    const earthquakes = store.latestByKind("quake", QUAKE_LIMIT).map(quakeView);
    const climate = store.latestBySource("oni")[0] ?? null;
    const warnings = groupWarnings(store.latestByKind("warning", LATEST_LIMIT).map(warningView));
    return { earthquakes, climate, warnings, timestamp: new Date().toISOString() };
  });

  /** MET Malaysia's official district forecast (district -> state from MET's own registry). */
  app.get("/api/official", async (req) => {
    const q = req.query as { state?: string; district?: string; town?: string };
    const ALIAS: Record<string, string> = {
      penang: "Pulau Pinang", "pulau pinang": "Pulau Pinang",
      "kuala lumpur": "WP Kuala Lumpur", kl: "WP Kuala Lumpur",
      labuan: "WP Labuan", "ft labuan": "WP Labuan",
      putrajaya: "WP Putrajaya", "ft putrajaya": "WP Putrajaya",
      "wp kuala lumpur": "WP Kuala Lumpur",
      malacca: "Melaka", "n. sembilan": "Negeri Sembilan", "negeri sembilan": "Negeri Sembilan",
    };
    const stateOf = (v: string): string => {
      const n = v.trim().toLowerCase();
      const hit = MALAYSIA_STATES.find((s) => s.name.toLowerCase() === n);
      return hit?.name ?? ALIAS[n] ?? v;
    };
    const state = q.state ? stateOf(q.state) : null;
    const townDistrict = districtFor(q.town, q.town ? store.townDistrict(q.town) : null);
    const rows = store.metForecast().map((r) => ({
      district: r.stationName,
      state: (r.meta?.state as string) ?? null,
      date: r.measuredAt.slice(0, 10),
      summary: (r.meta?.summary as string) ?? null,
      when: (r.meta?.when as string) ?? null,
      tmin: (r.meta?.tmin as number) ?? null,
      tmax: (r.meta?.tmax as number) ?? null,
    }));
    const filtered = rows.filter(
      (r) =>
        (!state || r.state === state) &&
        (!townDistrict || r.district === townDistrict) &&
        (!q.district || r.district.toLowerCase() === q.district.toLowerCase()),
    );
    return {
      district: townDistrict ?? q.district ?? null,
      official: filtered,
      districts: [...new Set(rows.map((r) => r.district))],
    };
  });

  app.get("/api/news", async () => ({
    news: store.latestByKind("news", 30).map((n) => ({
      title: n.stationName,
      url: n.meta?.url ?? null,
      outlet: n.meta?.outlet ?? null,
      publishedAt: n.measuredAt,
    })),
  }));

  /**
   * Model haze outlook: daily peak PM2.5 per locality from the Open-Meteo air-quality
   * series. Model data, so it is reported as concentrations and compared against the
   * WHO 24-hour guideline, never labelled with the official Malaysian AQI bands.
   */
  app.get("/api/haze", async (req) => {
    const q = req.query as { town?: string; state?: string };
    const rows = q.town ? store.hazeFor(q.town) : store.latestByKind("haze", 600);
    const scoped = q.state ? rows.filter((r) => r.meta?.state === q.state) : rows;
    return {
      town: q.town ?? null,
      haze: scoped.map((r) => ({
        date: r.measuredAt.slice(0, 10),
        pm25Max: r.value,
        pm25Avg: (r.meta?.avg as number) ?? null,
        aboveGuideline: r.value > WHO_PM25_24H,
      })),
    };
  });

  // Serve the built dashboard (its own dist) at the root when configured, so a single
  // origin (and a single tunnel URL) is both the site and the API. API routes are
  // registered above, so /api/* always wins; static serves the rest.
  if (dashboardDist) {
    // Hash-based cache-busting: the hashed /assets/* bundles are immutable (never
    // re-fetched once cached), but index.html must ALWAYS revalidate so the browser
    // never holds an HTML that references a pruned/superseded bundle (→ 404 until
    // hard refresh). Set per-file headers rather than relying on platform defaults.
    app.register(fastifyStatic, {
      root: dashboardDist,
      cacheControl: false,
      setHeaders(res: import("fastify").FastifyReply, path) {
        const raw = res.raw as import("http").ServerResponse;
        // index.html + sw.js + manifest must ALWAYS revalidate: a stale index.html
        // points at pruned bundles (404) and a stale/immutable sw.js keeps old code
        // (and the old service-worker that serves it) alive for hours.
        if (/index\.html$|sw\.js$|(?!.*\/).*\.webmanifest$/.test(path))
          raw.setHeader("Cache-Control", "no-cache");
        else raw.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    });
    // In-app routes that don't match a real file resolve to index.html, so deep
    // navigation through the tunnel never 404s.
    app.setNotFoundHandler((req, reply) => {
      const path = (req.url ?? "").split("?")[0] ?? "";
      if (req.method === "GET" && !path.startsWith("/api/") && !path.startsWith("/v1/") && !/\.[a-z0-9]+$/i.test(path)) {
        return reply.sendFile("index.html");
      }
      reply.code(404).send({ error: "not_found", path });
    });
  }

  /**
   * Current flood + heavy-rain alerts from InfoBanjir: river levels and hourly rainfall
   * currently in an alert band. Alerts are freshness-gated at ingest, so a stale or
   * offline station never surfaces here as a (false) alarm.
   */
  app.get("/api/flood", async (req) => {
    const q = req.query as { state?: string };
    const scope = (rows: ObservationRow[]) => (q.state ? rows.filter((r) => r.meta?.state === q.state) : rows);
    // The InfoBanjir watchlist can list a station more than once; surface one row
    // per station — the worst current severity — so the dashboard never shows dupes.
    const rank = { Danger: 0, Warning: 1, Alert: 2, Moderate: 3, Heavy: 3 };
    const worst = (rows: ObservationRow[]) => {
      const seen = new Map<string, ObservationRow>();
      for (const r of rows) {
        const cur = seen.get(r.station);
        const rk = rank[(r.meta?.severity as keyof typeof rank) ?? ""] ?? 9;
        if (!cur || rk < (rank[(cur.meta?.severity as keyof typeof rank) ?? ""] ?? 9)) seen.set(r.station, r);
      }
      return [...seen.values()];
    };
    return {
      river: worst(scope(store.latestByKind("flood"))).map((r) => ({
        station: r.station, stationName: r.stationName, state: r.meta?.state, district: r.meta?.district,
        basin: r.meta?.basin, level: r.value, severity: r.meta?.severity, trend: r.meta?.trend,
        lat: r.meta?.lat, lon: r.meta?.lon, at: r.measuredAt,
      })),
      rain: worst(scope(store.latestByKind("rainfall"))).map((r) => ({
        station: r.station, stationName: r.stationName, state: r.meta?.state, district: r.meta?.district,
        mmHour: r.value, severity: r.meta?.severity, lat: r.meta?.lat, lon: r.meta?.lon, at: r.measuredAt,
      })),
      timestamp: new Date().toISOString(),
    };
  });

  return app;
}
