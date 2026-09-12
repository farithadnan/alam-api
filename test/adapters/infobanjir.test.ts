import { afterEach, describe, expect, it, vi } from "vitest";
import { InfobanjirAdapter, parseMyDateTime } from "../../src/adapters/infobanjir.js";

const FRESH = "12/09/2026 15:00"; // Malaysia local (UTC+8)
const STALE = "12/09/2026 03:00"; // 12h earlier — beyond the 4h freshness window

const rec = (o: Record<string, string>) => ({
  station_id: "ST-1",
  station_name: "Sg. Test",
  district: "Muar",
  state: "JOHOR",
  latitude: "1.97",
  longitude: "102.71",
  ...o,
});

const SAMPLE = [
  rec({ wl_severity_level: "Danger", level: "1.5", wl_date_time: FRESH }),
  rec({ rf_severity_level: "Heavy", rf1hour: "42", rf_date_time: FRESH }),
  // One station in both facets at the same time: neither facet may be dropped.
  rec({ wl_severity_level: "Warning", level: "2.0", wl_date_time: FRESH, rf_severity_level: "Moderate", rf1hour: "18", rf_date_time: FRESH }),
  rec({ wl_severity_level: "Normal", level: "1.0", wl_date_time: FRESH }), // not an alarm
  rec({ wl_severity_level: "Error", level: "-1", wl_date_time: FRESH }), // broken station
  rec({ wl_severity_level: "Warning", level: "2.0", wl_date_time: STALE }), // false alarm if kept
  rec({ rf_severity_level: "Light", rf1hour: "5", rf_date_time: FRESH }), // below the alert band
];

describe("InfobanjirAdapter (InfoBanjir current alerts)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes alert facets and drops Error/blank/old alerts (no false alarms)", async () => {
    const at = parseMyDateTime(FRESH)!;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => SAMPLE })));
    const rows = await new InfobanjirAdapter().poll(at);

    // Danger + Warning river, Heavy + Moderate rain = 4 observations; the multi-facet
    // record survives as BOTH, and Normal/Error/blank/stale/Light are all excluded.
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.source === "infobanjir")).toBe(true);

    const flood = rows.filter((r) => r.kind === "flood");
    const rain = rows.filter((r) => r.kind === "rainfall");
    expect(flood).toHaveLength(2);
    expect(rain).toHaveLength(2);

    expect(flood.map((r) => r.value).sort()).toEqual([1.5, 2]);
    expect(rain.map((r) => r.value).sort()).toEqual([18, 42]);

    expect(flood.find((r) => r.value === 2)?.meta).toMatchObject({ severity: "Warning", state: "Johor", type: "river" });
    expect(rain.find((r) => r.value === 18)?.meta).toMatchObject({ severity: "Moderate", type: "rain" });
    expect(flood.find((r) => r.value === 1.5)?.meta).toMatchObject({ lat: 1.97, lon: 102.71 });
  });
});

describe("parseMyDateTime (Malaysia local -> UTC epoch)", () => {
  it("parses DD/MM/YYYY HH:MM as UTC+8", () => {
    const epoch = parseMyDateTime("12/09/2026 15:00");
    expect(epoch).toBe(Date.UTC(2026, 8, 12, 15, 0) - 8 * 3_600_000);
  });
  it("returns null for malformed or empty input", () => {
    expect(parseMyDateTime("")).toBeNull();
    expect(parseMyDateTime("2026-09-12T15:00:00")).toBeNull();
    expect(parseMyDateTime(undefined)).toBeNull();
  });
});
