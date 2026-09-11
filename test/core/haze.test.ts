import { describe, expect, it } from "vitest";
import { dailyPm25, aboveGuideline, WHO_PM25_24H } from "../../src/core/haze.js";

const series = (time: string[], pm2_5: Array<number | null>) => ({ time, pm2_5 });

describe("dailyPm25 — hourly PM2.5 into a daily outlook", () => {
  it("groups by local date and takes the day's peak", () => {
    const out = dailyPm25(
      series(
        ["2026-09-11T23:00", "2026-09-11T10:00", "2026-09-12T09:00"],
        [12, 40, 8],
      ),
    );
    expect(out.map((d) => d.date)).toEqual(["2026-09-11", "2026-09-12"]);
    expect(out[0]).toMatchObject({ pm25Max: 40, pm25Avg: 26, hours: 2 });
    expect(out[1]).toMatchObject({ pm25Max: 8, hours: 1 });
  });

  it("sorts by date regardless of input order", () => {
    const out = dailyPm25(series(["2026-09-13T00:00", "2026-09-11T00:00"], [5, 9]));
    expect(out.map((d) => d.date)).toEqual(["2026-09-11", "2026-09-13"]);
  });

  it("skips null and non-finite readings instead of treating them as zero", () => {
    const out = dailyPm25(series(["2026-09-11T01:00", "2026-09-11T02:00", "2026-09-11T03:00"], [null, 30, Number.NaN]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ pm25Max: 30, pm25Avg: 30, hours: 1 });
  });

  it("drops days with no usable readings and handles an empty series", () => {
    expect(dailyPm25(series([], []))).toEqual([]);
    expect(dailyPm25({})).toEqual([]);
    expect(dailyPm25(series(["2026-09-11T01:00"], [null]))).toEqual([]);
  });

  it("rounds to one decimal", () => {
    const out = dailyPm25(series(["2026-09-11T01:00", "2026-09-11T02:00", "2026-09-11T03:00"], [7, 8, 8]));
    expect(out[0].pm25Avg).toBe(7.7);
  });
});

describe("aboveGuideline", () => {
  it("compares against the WHO 24-hour guideline", () => {
    expect(aboveGuideline(WHO_PM25_24H)).toBe(false); // at the guideline is not above it
    expect(aboveGuideline(WHO_PM25_24H + 0.1)).toBe(true);
    expect(aboveGuideline(80)).toBe(true);
  });
});
