import { describe, expect, it } from "vitest";
import { MET_DISTRICTS, districtState, isDistrict, districtsOf } from "../../src/core/metDistricts.js";

describe("MET district registry", () => {
  it("covers 168 district locations across 16 states/FTs", () => {
    expect(Object.keys(MET_DISTRICTS)).toHaveLength(168);
    expect(new Set(Object.values(MET_DISTRICTS).map(([, st]) => st)).size).toBe(16);
  });

  it("lists exactly Kedah's 12 districts (no towns, no state rows)", () => {
    expect(districtsOf("Kedah").map((d) => d.name)).toEqual([
      "Baling", "Bandar Baharu", "Kota Setar", "Kuala Muda", "Kubang Pasu",
      "Kulim", "Langkawi", "Padang Terap", "Pendang", "Pokok Sena", "Sik", "Yan",
    ]);
  });

  it("keeps other states' districts out of Kedah", () => {
    // the bug: towns from Penang/Selangor/Terengganu leaked into Kedah's list
    const kedah = districtsOf("Kedah").map((d) => d.name);
    for (const wrong of ["Bayan Baru", "Bayan Lepas", "Selayang", "Tasik Kenyir"]) {
      expect(kedah).not.toContain(wrong);
    }
    expect(districtState("Tn160")).toBeNull(); // Bayan Baru is a town, not a district
  });

  it("only accepts district ids (Ds…), rejecting towns, states, waters, divisions", () => {
    expect(isDistrict("Ds004")).toBe(true);   // Kota Setar
    expect(isDistrict("Tn003")).toBe(false);  // Alor Star (town)
    expect(isDistrict("St008")).toBe(false);  // a state row
    expect(isDistrict("Rc011")).toBe(false);  // Tasik Kenyir (recreational)
    expect(isDistrict("Dv501")).toBe(false);  // Kuching (Sarawak division)
    expect(isDistrict(null)).toBe(false);
  });

  it("resolves the district containing Alor Setar", () => {
    expect(districtState("Ds004")).toBe("Kedah");
    expect(districtsOf("Kedah").find((d) => d.name === "Kota Setar")).toBeTruthy();
  });

  it("normalises MET's state labels to the app's names", () => {
    expect(districtsOf("Penang")).toHaveLength(0);
    expect(districtsOf("Pulau Pinang")).toHaveLength(5);
    expect(districtState("Ds058")).toBe("WP Kuala Lumpur");
  });
});
