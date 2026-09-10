import Fastify from "fastify";
import cors from "@fastify/cors";
import type { Store, ObservationRow } from "../store/db.js";
import { aqiBand } from "../core/bands.js";
import { MALAYSIA_LOCALITIES } from "../core/localities.js";

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

export function buildServer(store: Store) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true, t: new Date().toISOString() }));

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
  app.get("/api/summary", async (req) => {
    const q = req.query as { state?: string };
    const state = q.state || "";
    const inState = (rows: ObservationRow[]) => (state ? rows.filter((r) => r.meta?.state === state) : rows);
    const stationBase = inState(store.latestBySource("doe-eqms").map(decorate));
    const since24 = new Date(Date.now() + 8 * 3_600_000 - 24 * 3_600_000).toISOString().slice(0, 19);
    const stations = stationBase.map((s) => ({
      ...s,
      coords: stationCoords(s.stationName, s.meta?.state as string | null | undefined),
      trend: store.history("doe-eqms", s.station, since24).map((r) => r.value),
    }));
    const weather = inState(store.latestBySource("open-meteo")).map((r) => {
      const loc = MALAYSIA_LOCALITIES.find((l) => l.slug === r.station);
      return { ...r, coords: loc ? { lat: loc.lat, lon: loc.lon } : null };
    });
    const forecast = inState(store.forecast("open-meteo"));
    const hourly = inState(store.hourly("open-meteo"));
    const earthquakes = store.latestByKind("quake", 20).map((qk) => ({
      source: qk.source, station: qk.station, stationName: qk.stationName, measuredAt: qk.measuredAt, magnitude: qk.value, meta: qk.meta ?? null,
    }));
    const warnings = store.latestByKind("warning", 20).map((w) => ({
      source: w.source, station: w.station, title: w.stationName, severity: w.value, measuredAt: w.measuredAt, meta: w.meta ?? null,
    }));
    const news = store.latestByKind("news", 15).map((n) => ({
      title: n.stationName, url: n.meta?.url ?? null, outlet: n.meta?.outlet ?? null, publishedAt: n.measuredAt,
    }));
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

  return app;
}
