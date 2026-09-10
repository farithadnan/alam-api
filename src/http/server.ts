import Fastify from "fastify";
import cors from "@fastify/cors";
import type { Store, ObservationRow } from "../store/db.js";
import { aqiBand } from "../core/bands.js";

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
    const stations = inState(store.latestBySource("doe-eqms").map(decorate));
    const weather = inState(store.latestBySource("open-meteo"));
    const forecast = inState(store.forecast("open-meteo"));
    const earthquakes = store.latestByKind("quake", 20).map((qk) => ({
      source: qk.source, station: qk.station, stationName: qk.stationName, measuredAt: qk.measuredAt, magnitude: qk.value, meta: qk.meta ?? null,
    }));
    const warnings = store.latestByKind("warning", 20).map((w) => ({
      source: w.source, station: w.station, title: w.stationName, severity: w.value, measuredAt: w.measuredAt, meta: w.meta ?? null,
    }));
    const climate = store.latestBySource("oni")[0] ?? null;
    const states = [
      ...new Set([
        ...store.latestBySource("doe-eqms").map((r) => r.meta?.state),
        ...store.latestBySource("open-meteo").map((r) => r.meta?.state),
      ].filter(Boolean)),
    ];
    return { states, stations, weather, forecast, hazards: { warnings, earthquakes, climate }, ts: new Date().toISOString() };
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
