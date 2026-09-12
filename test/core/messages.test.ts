import { describe, expect, it } from "vitest";
import { warningMsg, aqiMsg, aqiRecoveredMsg, quakeMsg, parsePayload, commands, ago, clock } from "../../src/core/messages.js";

describe("alert messages — one fact first, place, short, link", () => {
  it("leads a warning with the fact and the place", () => {
    const t = warningMsg({ title: "Thunderstorm Warning", place: "Perlis", issuedAt: new Date(Date.now() - 12 * 60_000).toISOString(), validUntil: "2026-09-11T18:00:00+08:00" });
    expect(t.split("\n")[0]).toBe("⚠️ Thunderstorm Warning — Perlis");
    expect(t).toContain("Issued 12 min ago");
    expect(t).toContain("Valid until");
    expect(t).toContain("ohmyalam.com");
  });

  it("omits the valid-until line rather than printing a hole", () => {
    const t = warningMsg({ title: "X", place: "Arau", issuedAt: new Date().toISOString(), validUntil: null });
    expect(t).not.toContain("Valid until");
    expect(t).not.toContain("undefined");
  });

  it("marks an AQI crossing with the band icon, value and place", () => {
    const t = aqiMsg({ value: 162, band: "Unhealthy", place: "Pasir Gudang", advice: "Avoid prolonged outdoor activity." });
    expect(t.split("\n")[0]).toBe("🔴 AQI 162 · Unhealthy");
    expect(t).toContain("Pasir Gudang");
    expect(t).toContain("Avoid prolonged outdoor activity.");
    expect(t).toContain("ohmyalam.com");
  });

  it("uses the recovery tone when air improves", () => {
    const t = aqiRecoveredMsg({ value: 48, band: "Good", place: "Arau" });
    expect(t).toContain("🟢 AQI improved to 48 · Good");
    expect(t).toContain("clear again");
  });

  it("states a quake as magnitude first, with depth and age", () => {
    const t = quakeMsg({ magnitude: 5.34, place: "83 km E of Lospalos", depthKm: 10.4, at: new Date(Date.now() - 3 * 3600_000).toISOString(), word: "Moderate" });
    expect(t.split("\n")[0]).toBe("🌐 M 5.3 · Moderate — 83 km E of Lospalos");
    expect(t).toContain("Depth 10 km");
    expect(t).toContain("3h ago");
  });

  it("keeps every alert short enough to read on a lock screen", () => {
    for (const t of [
      warningMsg({ title: "Thunderstorm Warning", place: "Perlis", issuedAt: new Date().toISOString(), validUntil: "2026-09-11T18:00:00+08:00" }),
      aqiMsg({ value: 162, band: "Unhealthy", place: "Pasir Gudang", advice: "Avoid prolonged outdoor activity." }),
      quakeMsg({ magnitude: 5.3, place: "83 km E of Lospalos", depthKm: 10, at: new Date().toISOString() }),
    ]) expect(t.split("\n").length).toBeLessThanOrEqual(6);
  });

  it("honours a SITE_URL override", () => {
    expect(aqiMsg({ value: 10, band: "Good", place: "X", url: "https://staging.example.com" })).toContain("staging.example.com");
  });
});

describe("deep links and commands", () => {
  it("parses loc_arau_perlis into a readable place", () => {
    expect(parsePayload("loc_arau_perlis")).toEqual({ town: "Arau", state: "Perlis" });
    expect(parsePayload("loc_johor-bahru_johor")).toEqual({ town: "Johor Bahru", state: "Johor" });
  });
  it("returns null for anything that is not a place payload", () => {
    expect(parsePayload("")).toBeNull();
    expect(parsePayload(undefined)).toBeNull();
    expect(parsePayload("hello")).toBeNull();
  });
  it("acknowledges a location change and lists what is on", () => {
    expect(commands.locationSet("Arau, Perlis")).toContain("Arau, Perlis");
    expect(commands.status("Arau, Perlis", ["AQI", "warnings"])).toContain("Alerts on: AQI, warnings");
    expect(commands.status("Arau, Perlis", [])).toContain("No alerts on.");
  });
  it("explains itself and how to stop", () => {
    expect(commands.help()).toContain("/stop");
    expect(commands.stopped()).toContain("Alerts off");
    expect(commands.welcome()).toContain("/location");
    expect(commands.welcome("Arau, Perlis")).toContain("Currently watching Arau, Perlis");
  });
  it("formats age and clock without inventing values", () => {
    expect(ago(new Date(Date.now() - 90 * 60_000).toISOString())).toBe("2h ago");
    expect(clock("2026-09-11T18:00:00+08:00")).toMatch(/6:00\s?PM/i);
  });
});
