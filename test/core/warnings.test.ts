import { describe, expect, it } from "vitest";
import { groupWarnings } from "../../src/core/warnings.js";

const w = (type: string, heading: string, measuredAt: string, severity = 1) => ({
  title: heading, severity, measuredAt, meta: { type, headingEn: heading },
});

describe("groupWarnings — one card per bulletin, not per state", () => {
  it("collapses the eight per-state thunderstorm rows into one", () => {
    const rows = ["Perlis", "Kedah", "Perak", "Kelantan", "Terengganu", "Pahang", "Sarawak", "Sabah"].map((_, i) =>
      w("thunderstorm", "THUNDERSTORMS WARNING", `2026-09-11T19:3${i}:00`),
    );
    const out = groupWarnings(rows);
    expect(out).toHaveLength(1);
    expect(out[0].measuredAt).toBe("2026-09-11T19:37:00"); // most recent issue time wins
  });

  it("collapses rows whose metadata differs but whose heading agrees", () => {
    const mk = (type: string, at: string) => ({ title: "Thunderstorms Warning", severity: 1, measuredAt: at, meta: { type, headingEn: "THUNDERSTORMS WARNING", textEn: "Thunderstorms over several states" } });
    const out = groupWarnings([mk("thunderstorm", "2026-09-11T10:00:00"), mk("", "2026-09-11T11:00:00")]);
    expect(out).toHaveLength(1);
  });

  it("keeps the most complete text for a shared heading", () => {
    const mk = (text: string, at: string) => ({ title: "Thunderstorms Warning", severity: 1, measuredAt: at, meta: { headingEn: "THUNDERSTORMS WARNING", textEn: text } });
    const out = groupWarnings([mk("Perlis", "2026-09-11T10:00:00"), mk("Perlis, Kedah and Perak", "2026-09-11T09:00:00")]);
    expect(out).toHaveLength(1);
    expect(out[0].meta?.textEn).toBe("Perlis, Kedah and Perak"); // the fuller list wins
    expect(out[0].measuredAt).toBe("2026-09-11T10:00:00"); // newest issue time
  });

  it("keeps genuinely different bulletins apart", () => {
    const out = groupWarnings([
      w("thunderstorm", "THUNDERSTORMS WARNING", "2026-09-11T10:00:00"),
      { title: "HEAVY RAIN WARNING", severity: 1, measuredAt: "2026-09-11T11:00:00", meta: { type: "heavy_rain", headingEn: "HEAVY RAIN WARNING", textEn: "Heavy rain expected" } },
      w("thunderstorm", "THUNDERSTORMS WARNING", "2026-09-11T12:00:00"),
    ]);
    expect(out).toHaveLength(2); // different heading and text
  });

  it("does not reorder or mutate unrelated rows, and handles empty input", () => {
    const rows = [w("a", "A", "2026-09-11T01:00:00"), w("b", "B", "2026-09-11T02:00:00")];
    expect(groupWarnings(rows).map((x) => x.title)).toEqual(["A", "B"]);
    expect(groupWarnings([])).toEqual([]);
  });

  it("survives rows missing meta", () => {
    const out = groupWarnings([{ title: "X" }, { title: "X" }]);
    expect(out).toHaveLength(1);
  });
});
