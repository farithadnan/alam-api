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
/** A MET district row. `state` is null for non-district locations (towns etc.). */
const haze = (slug: string, date: string, pm25: number): Observation => ({
  source: "open-meteo",
  station: slug,
  stationName: slug,
  measuredAt: `${date}T00:00:00`,
  kind: "haze",
  value: pm25,
  meta: { state: "Perlis", avg: pm25 - 5, hours: 24 },
});
const district = (name: string, summary: string, state: string | null = null): Observation => ({
  source: "my-met-forecast",
  station: name.toLowerCase(),
  stationName: name,
  measuredAt: "2026-09-11T00:00:00",
  kind: "metfc",
  value: 32,
  meta: { summary, when: "Petang", tmin: 24, tmax: 32, state },
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
    haze("arau", "2026-09-12", 42.5),
    haze("arau", "2026-09-11", 18),
    district("Langkawi", "Ribut petir", "Kedah"),
    district("Kulim", "Tiada Hujan", "Kedah"),
    district("Perlis", "Hujan di beberapa tempat", "Perlis"),
    district("Central Seberang Perai", "Hujan", "Pulau Pinang"),
    // a town, not a district: unknown state -> must never appear in a state list
    district("Bayan Baru", "Ribut petir", null),
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

describe("GET /api/official — MET districts resolved via MET's own registry", () => {
  it("returns exactly Kedah's districts — no districts from other states", async () => {
    const { body } = await get("/api/official?state=Kedah");
    const districts = [...new Set(body.official.map((r: { district: string }) => r.district))].sort();
    expect(districts).toEqual(["Kulim", "Langkawi"]); // the seeded Kedah districts
    expect(body.official.every((r: { state: string }) => r.state === "Kedah")).toBe(true);
  });

  it("does not leak towns or state rows from other states into a state list", async () => {
    const { body } = await get("/api/official?state=Kedah");
    const names = body.official.map((r: { district: string }) => r.district);
    // these are towns/state rows, not Kedah districts — the old bug put them here
    for (const wrong of ["Bayan Baru", "Bayan Lepas", "Selayang", "Tasik Kenyir", "Kedah"]) {
      expect(names).not.toContain(wrong);
    }
  });

  it("maps a district named after its own state (Perlis)", async () => {
    const { body } = await get("/api/official?state=Perlis");
    expect([...new Set(body.official.map((r: { district: string }) => r.district))]).toEqual(["Perlis"]);
  });

  it("accepts state aliases (penang -> Pulau Pinang)", async () => {
    const { body } = await get("/api/official?state=penang");
    expect(body.official.length).toBeGreaterThan(0);
    expect(body.official.every((r: { state: string }) => r.state === "Pulau Pinang")).toBe(true);
  });
});

describe("GET /api/haze — model haze outlook", () => {
  it("returns the town's daily peak PM2.5, soonest first, flagged against the WHO guideline", async () => {
    const { body } = await get("/api/haze?town=arau");
    expect(body.town).toBe("arau");
    expect(body.haze).toHaveLength(2);
    expect(body.haze[0]).toMatchObject({ date: "2026-09-11", pm25Max: 18, aboveGuideline: true });
    expect(body.haze[1]).toMatchObject({ date: "2026-09-12", pm25Max: 42.5, aboveGuideline: true });
  });

  it("filters by state, and returns nothing for a town with no outlook", async () => {
    expect((await get("/api/haze?state=Perlis")).body.haze).toHaveLength(2);
    expect((await get("/api/haze?state=Kedah")).body.haze).toHaveLength(0);
    expect((await get("/api/haze?town=langkawi")).body.haze).toHaveLength(0);
  });
});
