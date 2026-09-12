import { describe, expect, it } from "vitest";
import { relevance } from "../../src/adapters/news.js";

describe("news relevance — the headline decides", () => {
  it("keeps hazard stories", () => {
    for (const t of [
      "Flood warning issued for Johor",
      "Haze forces schools to close in Sarawak",
      "Strong earthquake strikes off Sumatra",
      "MET issues thunderstorms warning for several states",
      "Banjir kilat di Kuala Lumpur",
      "Air quality drops to unhealthy levels in Pasir Gudang",
    ]) expect(relevance(t), t).toBe(true);
  });

  it("drops unrelated national news that merely mentions weather in the body", () => {
    for (const t of [
      "Rain fails to stop Malaysia Open badminton final",
      "Zoo Negara welcomes two new pandas",
      "Nepal to host regional summit next month",
      "Ringgit strengthens against the dollar",
      "New MRT line opens to commuters",
      "Bolivia hapus subsidi bahan api demi bantuan IMF", // 'bahan api' = fuel, not fire
      "Ringgit ends lower against the US dollar",
      "Malaysian badminton eye ending 20-year Asian Games title drought",
    ]) expect(relevance(t), t).toBe(false);
  });

  it("ignores the summary when judging relevance", () => {
    // the exact bug: a clean headline let through by a stray word in the description
    expect(relevance("Malaysia Open badminton final", "Heavy rain delayed play")).toBe(false);
  });
});
