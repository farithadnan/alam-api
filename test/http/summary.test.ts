import { describe, expect, it } from "vitest";
import { Store } from "../../src/store/db.js";
import { buildServer } from "../../src/http/server.js";
import type { Observation } from "../../src/core/types.js";

// Keep Fastify quiet in tests.
process.env.LOG_LEVEL = "silent";

const T = "2026-09-11T10:00:00";

const aqi = (station: string, name: string, state: string, value: number): Observation => ({
  source: "doe-eqms",
  station,
  stationName: name,
  measuredAt: T,
  kind: "aqi",
  value,
  meta: { state, lat: 6.4, lon: 100.2, category: "Sub Urban" },
});
const weather = (slug: string, name: string, state: string, value: number): Observation => ({
  source: "open-meteo",
  station: slug,
  stationName: name,
  measuredAt: T,
  kind: "weather",
  value,
  meta: { state, code: "3", humidity: 80 },
});
const series = (kind: "hourly" | "forecast", slug: string, name: string, state: string): Observation[] =>
  [0, 1, 2].map((i) => ({
    source: "open-meteo" as const,
    station: slug,
    stationName: name,
    measuredAt: `2026-09-11T1${i}:00:00`,
    kind,
    value: 28 + i,
    meta: { state, code: "3", precip: 10, tmax: 32, tmin: 25 },
  }));
const district = (name: string, summary: string): Observation => ({
  source: "my-met-forecast",
  station: name.toLowerCase(),
  stationName: name,
  measuredAt: "2026-09-11T00:00:00",
  kind: "metfc",
  value: 32,
  meta: { summary, when: "Petang", tmin: 24, tmax: 32 },
});

function seed(): Store {
  const store = new Store(":memory:");
  store.ingest([
    aqi("CA01R", "Kangar, PERLIS", "Perlis", 20),
    aqi("CA02K", "Langkawi, KEDAH", "Kedah", 23),
    weather("arau", "Arau", "Perlis", 28),
    weather("kangar", "Kangar", "Perlis", 30),
    weather("langkawi", "Langkawi", "Kedah", 31),
    ...series("hourly", "arau", "Arau", "Perlis"),
    ...series("hourly", "kangar", "Kangar", "Perlis"),
    ...series("forecast", "arau", "Arau", "Perlis"),
    ...series("forecast", "kangar", "Kangar", "Perlis"),
    district("Langkawi", "Ribut petir"),
    district("Kulim", "Tiada Hujan"),
    district("Perlis", "Hujan di beberapa tempat"),
  ]);
  return store;
}

async function get(url: string) {
  const store = seed();
  const app = buildServer(store);
  try {
    const res = await app.inject({ method: "GET", url });
    return { status: res.statusCode, headers: res.headers, body: res.json() };
  } finally {
    await app.close();
    store.close();
  }
}

describe("GET /api/summary — payload scoping", () => {
  it("filters stations + weather to the requested state", async () => {
    const { status, body } = await get("/api/summary?state=Perlis&town=arau");
    expect(status).toBe(200);
    expect(body.stations.map((s: { station: string }) => s.station)).toEqual(["CA01R"]);
    expect(body.weather.map((w: { station: string }) => w.station).sort()).toEqual(["arau", "kangar"]);
  });

  it("never ships per-station day series (history) — only the compact trend", async () => {
    const { body } = await get("/api/summary?state=Perlis&town=arau");
    const [station] = body.stations;
    expect(station).toHaveProperty("trend");
    expect(station).not.toHaveProperty("history");
  });

  it("scopes hourly + forecast to the single requested town", async () => {
    const { body } = await get("/api/summary?state=Perlis&town=arau");
    expect([...new Set(body.hourly.map((r: { station: string }) => r.station))]).toEqual(["arau"]);
    expect([...new Set(body.forecast.map((r: { station: string }) => r.station))]).toEqual(["arau"]);
  });

  it("includes extra towns being inspected via ?towns= (drill-down regression guard)", async () => {
    const { body } = await get("/api/summary?state=Perlis&town=arau&towns=kangar");
    expect([...new Set(body.hourly.map((r: { station: string }) => r.station))].sort()).toEqual(["arau", "kangar"]);
    expect([...new Set(body.forecast.map((r: { station: string }) => r.station))].sort()).toEqual(["arau", "kangar"]);
  });

  it("sends no hourly/forecast when no town is known yet (first paint)", async () => {
    const { body } = await get("/api/summary?state=Perlis");
    expect(body.hourly).toEqual([]);
    expect(body.forecast).toEqual([]);
    expect(body.stations.length).toBeGreaterThan(0); // the rest still renders
  });

  it("advertises the rate limit on every response", async () => {
    const { headers } = await get("/api/summary?state=Perlis");
    expect(Number(headers["x-ratelimit-limit"])).toBeGreaterThan(0);
    expect(headers["x-ratelimit-remaining"]).toBeDefined();
  });
});

describe("GET /api/official — MET districts mapped to states", () => {
  it("returns only the requested state's districts, with locality-based mapping", async () => {
    const { body } = await get("/api/official?state=Kedah");
    const districts = [...new Set(body.official.map((r: { district: string }) => r.district))].sort();
    expect(districts).toEqual(["Kulim", "Langkawi"]); // both map to Kedah via the locality registry
    expect(body.official[0]).toMatchObject({ state: "Kedah" });
  });

  it("maps a district named after the state itself (no locality of that name)", async () => {
    const { body } = await get("/api/official?state=Perlis");
    expect([...new Set(body.official.map((r: { district: string }) => r.district))]).toEqual(["Perlis"]);
  });
});
