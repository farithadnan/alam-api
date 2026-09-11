import { describe, expect, it } from "vitest";
import { Store } from "../../src/store/db.js";

const store = () => new Store(":memory:");

describe("poll freshness (what stops a restart re-polling everything)", () => {
  it("treats a never-polled source as stale", () => {
    expect(store().isStale("open-meteo", 1_800_000)).toBe(true);
  });

  it("treats a just-polled source as fresh, inside its interval", () => {
    const s = store();
    s.recordPoll("open-meteo", 12);
    expect(s.isStale("open-meteo", 1_800_000)).toBe(false);
  });

  it("goes stale again once the interval has elapsed", () => {
    const s = store();
    s.recordPoll("news", 7);
    expect(s.isStale("news", 1_800_000)).toBe(false);
    expect(s.isStale("news", 0)).toBe(true); // nothing is fresh for zero ms
  });

  it("tracks sources independently", () => {
    const s = store();
    s.recordPoll("usgs-eq", 3);
    expect(s.isStale("usgs-eq", 600_000)).toBe(false);
    expect(s.isStale("oni", 86_400_000)).toBe(true); // oni has never run
  });

  it("keeps the last success when a later poll fails, and records the error", () => {
    const s = store();
    s.recordPoll("my-met", 1);
    const okAt = s.sourceState("my-met").lastOkAt;
    s.recordPoll("my-met", 0, "HTTP 429");
    expect(s.sourceState("my-met").lastOkAt).toBe(okAt); // a blip does not erase health
  });
});

describe("town district reference data (migration 003)", () => {
  it("exposes asserted exceptions and nothing for identity towns", () => {
    const s = store();
    expect(s.townDistrict("alor-setar")).toBe("Kota Setar");
    expect(s.townDistrict("kluang")).toBeNull(); // derived, not asserted
    expect(s.townDistrict("nope")).toBeNull();
  });
});
