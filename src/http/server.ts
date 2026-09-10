import Fastify from "fastify";
import cors from "@fastify/cors";
import type { Store, ObservationRow } from "../store/db.js";
import { aqiBand } from "../core/bands.js";

function decorate(o: ObservationRow) {
  return { ...o, band: o.kind === "aqi" ? aqiBand(o.value) : undefined };
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

  // Earthquakes + climate (El Niño) — populated now; shape stays stable for the dashboard.
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
    return { earthquakes, climate, timestamp: new Date().toISOString() };
  });

  return app;
}
