import { afterEach, describe, expect, it, vi } from "vitest";
import { MetWarningsAdapter } from "../../src/adapters/metWarnings.js";

const SAMPLE = [
  {
    warning_issue: {
      issued: "2026-09-11T00:50:00",
      title_en: "Strong Winds and Rough Seas Warning",
      title_bm: "Amaran Angin Kencang dan Laut Bergelora",
    },
    valid_from: "2026-09-10T00:00:00",
    valid_to: "2026-09-15T00:00:00",
    heading_en: "FIRST CATEGORY WARNING ON STRONG WINDS AND ROUGH SEAS",
    text_en: "Strong winds of 40-50 kmph with wave height up to 3.5m.",
  },
  {
    warning_issue: {
      issued: "2026-09-11T01:00:00",
      title_en: "Heavy Rain Warning",
      title_bm: "Amaran Hujan Lebat",
    },
    valid_from: "2026-09-11T00:00:00",
    valid_to: "2026-09-12T00:00:00",
    heading_en: "SECOND CATEGORY WARNING ON HEAVY RAIN",
    text_en: "Heavy rain expected over low-lying areas.",
  },
  { // "no advisory" sentinel must be filtered
    warning_issue: { issued: "2026-09-10T22:30:00", title_en: "No Advisory", title_bm: "Tiada Nasihat" },
    valid_from: "2026-09-10T00:00:00",
    valid_to: "2026-09-11T00:00:00",
    heading_en: "NO ADVISORY IN FORCE",
    text_en: "",
  },
];

describe("MetWarningsAdapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes MET warnings with bilingual meta and category severity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => SAMPLE })));
    const rows = await new MetWarningsAdapter().poll();

    expect(rows).toHaveLength(2);
    const [wind, rain] = rows;
    expect(wind).toMatchObject({
      source: "my-met",
      kind: "warning",
      value: 1,
      station: "strong-winds-and-rough-seas-warning",
    });
    expect(wind?.meta).toMatchObject({ titleBm: "Amaran Angin Kencang dan Laut Bergelora", validTo: "2026-09-15T00:00:00" });
    expect(rain?.value).toBe(2); // second category → severity 2
    expect(rain?.meta).toMatchObject({ titleBm: "Amaran Hujan Lebat" });
  });
});
