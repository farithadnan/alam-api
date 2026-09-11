import { describe, expect, it } from "vitest";
import { MALAYSIA_LOCALITIES } from "../../src/core/localities.js";
import { districtsOf } from "../../src/core/metDistricts.js";
import { districtFor, isLocality } from "../../src/core/townDistricts.js";
import { Store } from "../../src/store/db.js";

// :memory: runs the migrations, so the asserted crosswalk rows are present
const store = new Store(":memory:");
const resolve = (slug: string) => districtFor(slug, store.townDistrict(slug));

describe("town -> MET district resolution", () => {
  it("resolves every locality we poll", () => {
    const missing = MALAYSIA_LOCALITIES.filter((l) => !resolve(l.slug)).map((l) => l.slug);
    expect(missing).toEqual([]);
  });

  it("every resolution is a district of the town's own state", () => {
    const wrong = MALAYSIA_LOCALITIES.filter((l) => !districtsOf(l.state).some((d) => d.name === resolve(l.slug)))
      .map((l) => `${l.slug} -> ${resolve(l.slug)} (${l.state})`);
    expect(wrong).toEqual([]);
  });

  it("derives rows whose name already matches the district", () => {
    expect(districtFor("kluang", null)).toBe("Kluang");
    expect(districtFor("kuching", null)).toBe("Kuching");
    expect(districtFor("muar", null)).toBe("Muar");
    expect(districtFor("nowhere-at-all", null)).toBeNull(); // not a locality we poll
  });

  it("uses the asserted row when the city is not its district", () => {
    expect(resolve("alor-setar")).toBe("Kota Setar");
    expect(resolve("george-town")).toBe("Timur Laut");
    expect(resolve("melaka-city")).toBe("Melaka Tengah");
    expect(resolve("cameron-highlands")).toBe("Tanah Tinggi Cameron");
    expect(resolve("ipoh")).toBe("Kinta");
    expect(resolve("kajang")).toBe("Hulu Langat");
  });

  it("refuses an asserted district that is not in the town's state", () => {
    expect(districtFor("alor-setar", "Kinta")).toBeNull(); // Kinta is Perak
    expect(districtFor("kuching", "Petaling")).toBeNull();
  });

  it("returns null for an unknown slug", () => {
    expect(resolve("nowhere")).toBeNull();
    expect(isLocality("nowhere")).toBe(false);
    expect(isLocality("arau")).toBe(true);
  });

  it("keeps the asserted table small - only genuine exceptions", () => {
    const asserted = MALAYSIA_LOCALITIES.filter((l) => store.townDistrict(l.slug));
    expect(asserted.length).toBeLessThan(MALAYSIA_LOCALITIES.length / 2);
  });
});
