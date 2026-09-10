import { afterEach, describe, expect, it, vi } from "vitest";
import { DoeEqmsAdapter } from "../../src/adapters/doeEqms.js";

// One state response carries 24h of hourly rows per station; here compacted to the shape we parse.
const TABLES: Record<number, unknown[]> = {
  1: [
    { STATION_ID: "CA29J", STATION_LOCATION: "Segamat, JOHOR", DATETIME: "2026-09-10T04:00:00", API: 85 },
    { STATION_ID: "CA33J", STATION_LOCATION: "Larkin, JOHOR", DATETIME: "2026-09-10T04:00:00", API: 131 },
  ],
  2: [
    { STATION_ID: "KA01K", STATION_LOCATION: "Alor Setar, KEDAH", DATETIME: "2026-09-10T04:00:00", API: 40 },
  ],
};

function stub() {
  return vi.fn(async (url: string) => {
    const id = Number(/stateid=(\d+)/.exec(url)?.[1]);
    return { ok: true, json: async () => ({ api_table_hourly: TABLES[id] ?? [] }) };
  });
}

describe("DoeEqmsAdapter (nationwide)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("polls every configured state and acquires ALL of its stations", async () => {
    vi.stubGlobal("fetch", stub());
    const rows = await new DoeEqmsAdapter([{ id: 1, name: "Johor" }, { id: 2, name: "Kedah" }]).poll();

    expect(rows).toHaveLength(3); // all stations across both states
    const johor = rows.filter((r) => r.meta?.state === "Johor");
    const kedah = rows.filter((r) => r.meta?.state === "Kedah");
    expect(johor).toHaveLength(2); // every Johor station, not a subset
    expect(kedah).toHaveLength(1);
    expect(johor[0]).toMatchObject({ source: "doe-eqms", kind: "aqi", value: 85, station: "CA29J" });
    expect(kedah[0]?.station).toBe("KA01K");
  });

  it("skips a failing state instead of aborting the whole poll", async () => {
    const f = vi.fn(async (url: string) => {
      if (/stateid=2/.test(url)) throw new Error("boom");
      const id = Number(/stateid=(\d+)/.exec(url)?.[1]);
      return { ok: true, json: async () => ({ api_table_hourly: TABLES[id] ?? [] }) };
    });
    vi.stubGlobal("fetch", f);
    const rows = await new DoeEqmsAdapter([{ id: 1, name: "Johor" }, { id: 2, name: "Kedah" }]).poll();
    expect(rows).toHaveLength(2); // Johor's only; Kedah skipped
    expect(rows.every((r) => r.meta?.state === "Johor")).toBe(true);
  });
});
