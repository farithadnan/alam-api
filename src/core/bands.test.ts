import { describe, expect, it } from "vitest";
import { aqiBand } from "./bands.js";

describe("aqiBand", () => {
  it("classifies the Malaysia APIMS bands", () => {
    expect(aqiBand(0).label).toBe("Good");
    expect(aqiBand(50).label).toBe("Good");
    expect(aqiBand(51).label).toBe("Moderate");
    expect(aqiBand(101).label).toBe("Unhealthy");
    expect(aqiBand(201).label).toBe("Very Unhealthy");
    expect(aqiBand(301).label).toBe("Hazardous");
    expect(aqiBand(400).label).toBe("Hazardous");
  });

  it("carries advice and color for the UI", () => {
    const b = aqiBand(120);
    expect(b.advice).toBeTruthy();
    expect(b.color).toMatch(/^#/);
  });
});
