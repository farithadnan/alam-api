import { afterEach, describe, expect, it, vi } from "vitest";
import { OniAdapter, ensoPhase } from "./oni.js";

const SAMPLE = `  JFM 2026  26.57  -0.21
  FMA 2026  27.34   0.11
  MAM 2026  28.09   0.46
  AMJ 2026  28.74   0.95
  MJJ 2026  29.02   1.39
  JJA 2026  29.09   1.80
`;

describe("ensoPhase", () => {
  it("thresholds El Niño / La Niña / Neutral at ±0.5", () => {
    expect(ensoPhase(1.8)).toBe("El Niño");
    expect(ensoPhase(-0.8)).toBe("La Niña");
    expect(ensoPhase(0.11)).toBe("Neutral");
    expect(ensoPhase(0.5)).toBe("El Niño");
  });
});

describe("OniAdapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses the latest season from the NOAA text index", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => SAMPLE })),
    );
    const rows = await new OniAdapter().poll();
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.source).toBe("oni");
    expect(r.kind).toBe("climate");
    expect(r.value).toBe(1.8); // JJA 2026 anomaly
    expect(r.meta).toMatchObject({ phase: "El Niño", season: "JJA", year: "2026" });
    expect(r.measuredAt.startsWith("2026-07")).toBe(true);
  });

  it("throws when the feed has no parseable row", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "no data here" })));
    await expect(new OniAdapter().poll()).rejects.toThrow(/No ONI data row/);
  });
});
