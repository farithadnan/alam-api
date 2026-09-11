import { describe, expect, it } from "vitest";
import { MALAYSIA_LOCALITIES } from "../../src/core/localities.js";
import { districtState, districtsOf } from "../../src/core/metDistricts.js";
import { TOWN_DISTRICT, districtOf } from "../../src/core/townDistricts.js";

describe("town -> MET district coverage", () => {
  it("maps every locality we poll", () => {
    const missing = MALAYSIA_LOCALITIES.filter((l) => !districtOf(l.slug)).map((l) => l.slug);
    expect(missing).toEqual([]);
    expect(Object.keys(TOWN_DISTRICT)).toHaveLength(MALAYSIA_LOCALITIES.length);
  });

  it("every mapped district exists, in the town's own state", () => {
    const wrong = MALAYSIA_LOCALITIES.filter((l) => {
      const d = districtOf(l.slug)!;
      return !districtsOf(l.state).some((x) => x.name === d);
    }).map((l) => `${l.slug} -> ${districtOf(l.slug)} (${l.state})`);
    expect(wrong).toEqual([]);
  });

  it("is internally consistent with the district registry", () => {
    for (const [slug, d] of Object.entries(TOWN_DISTRICT)) {
      const loc = MALAYSIA_LOCALITIES.find((l) => l.slug === slug)!;
      expect(districtsOf(loc.state).map((x) => x.name)).toContain(d);
    }
  });

  it("resolves the cities that are not their own district", () => {
    expect(districtOf("alor-setar")).toBe("Kota Setar");
    expect(districtOf("shah-alam")).toBe("Petaling");
    expect(districtOf("george-town")).toBe("Timur Laut"); // feed name, not "Northeast Penang Island"
    expect(districtOf("ipoh")).toBe("Kinta");
    expect(districtOf("kangar")).toBe("Perlis");
    expect(districtOf("melaka-city")).toBe("Melaka Tengah");
    expect(districtOf("taiping")).toBe("Larut, Matang Dan Selama");
    expect(districtOf("cameron-highlands")).toBe("Tanah Tinggi Cameron");
    expect(districtOf("unknown-slug")).toBeNull();
  });
});
