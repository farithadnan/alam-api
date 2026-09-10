import { describe, expect, it } from "vitest";
import { Store } from "../../src/store/db.js";

const openMeteoRow = (kind: "weather" | "aqi", value: number) => ({
  source: "open-meteo" as const,
  station: "johor-bahru",
  stationName: "Johor Bahru",
  measuredAt: "2026-09-10T11:00:00",
  kind,
  value,
});

describe("Store", () => {
  it("keeps distinct kinds at the same (source, station, timestamp)", () => {
    const store = new Store(":memory:");
    try {
      store.ingest([openMeteoRow("weather", 30), openMeteoRow("aqi", 42)]);
      const rows = store.latestBySource("open-meteo");
      expect(rows).toHaveLength(2); // weather AND aqi both survive the dedupe
      expect(rows.map((r) => r.kind).sort()).toEqual(["aqi", "weather"]);
      expect(rows.find((r) => r.kind === "aqi")?.value).toBe(42);
    } finally {
      store.close();
    }
  });

  it("rejects a true duplicate (same source, station, timestamp, kind)", () => {
    const store = new Store(":memory:");
    try {
      let inserted = store.ingest([openMeteoRow("aqi", 42), openMeteoRow("aqi", 48)]);
      expect(inserted).toBe(1); // second is a dedupe hit
      const rows = store.latestBySource("open-meteo");
      expect(rows.filter((r) => r.kind === "aqi")).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("excludes future forecast from 'current' but exposes it via forecast()", () => {
    const store = new Store(":memory:");
    try {
      const now = "2026-09-10T11:00:00";
      const future = "2026-09-15T12:00:00Z";
      store.ingest([
        openMeteoRow("weather", 27),
        openMeteoRow("aqi", 42),
        { ...openMeteoRow("forecast" as never, 31), measuredAt: future, station: "johor-bahru" },
      ]);
      const current = store.latestBySource("open-meteo");
      expect(current.map((r) => r.kind).sort()).toEqual(["aqi", "weather"]); // not forecast
      const fc = store.forecast("open-meteo");
      expect(fc).toHaveLength(1);
      expect(fc[0]?.kind).toBe("forecast");
    } finally {
      store.close();
    }
  });
});
