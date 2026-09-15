import { describe, expect, it } from "vitest";
import { warningMsg, aqiMsg, aqiRecoveredMsg, quakeMsg, parsePayload, commands, ago, clock, floodMsg, rainMsg } from "../../src/core/messages.js";
import { composeBody } from "../../src/bot/notifier.js";

describe("alert messages — one fact first, place, short, link", () => {
  it("leads a warning with the fact and the place", () => {
    const t = warningMsg({ title: "Thunderstorm Warning", place: "Perlis", issuedAt: new Date(Date.now() - 12 * 60_000).toISOString(), validUntil: "2026-09-11T18:00:00+08:00" });
    expect(t.split("\n")[0]).toBe("<b>⚠️ Thunderstorm Warning — Perlis</b>");
    expect(t).toContain("Issued 12 min ago");
    expect(t).toContain("Valid until");
  });

  it("omits the valid-until line rather than printing a hole", () => {
    const t = warningMsg({ title: "X", place: "Arau", issuedAt: new Date().toISOString(), validUntil: null });
    expect(t).not.toContain("Valid until");
    expect(t).not.toContain("undefined");
  });

  it("marks an AQI crossing with the band icon, value and place", () => {
    const t = aqiMsg({ value: 162, band: "Unhealthy", place: "Pasir Gudang", advice: "Avoid prolonged outdoor activity." });
    expect(t.split("\n")[0]).toBe("<b>🔴 AQI 162 · Unhealthy</b>");
    expect(t).toContain("Pasir Gudang");
    expect(t).toContain("Avoid prolonged outdoor activity.");
  });

  it("uses the recovery tone when air improves", () => {
    const t = aqiRecoveredMsg({ value: 48, band: "Good", place: "Arau" });
    expect(t).toContain("🟢 AQI improved to 48 · Good");
    expect(t).toContain("clear again");
  });

  it("states a quake as magnitude first, with depth and age", () => {
    const t = quakeMsg({ magnitude: 5.34, place: "83 km E of Lospalos", depthKm: 10.4, at: new Date(Date.now() - 3 * 3600_000).toISOString(), word: "Moderate" });
    expect(t.split("\n")[0]).toBe("<b>🌐 M 5.3 · Moderate — 83 km E of Lospalos</b>");
    expect(t).toContain("Depth 10 km");
    expect(t).toContain("3h ago");
  });

  it("keeps every alert topic URL-free — the link is appended once, by the notifier", () => {
    for (const t of [
      warningMsg({ title: "Thunderstorm Warning", place: "Perlis", issuedAt: new Date().toISOString() }),
      aqiMsg({ value: 162, band: "Unhealthy", place: "Pasir Gudang", advice: "Avoid prolonged outdoor activity." }),
      quakeMsg({ magnitude: 5.3, place: "83 km E of Lospalos", depthKm: 10, at: new Date().toISOString() }),
      floodMsg({ place: "Muar, Johor", station: "Sg. Test", level: 2.4, severity: "Danger" }),
      rainMsg({ place: "Muar, Johor", station: "Gauge 1", mmHour: 45, severity: "Heavy" }),
    ]) expect(t).not.toMatch(/https?:\/\//);
  });
});

describe("notification composition — one app link per notification", () => {
  it("a single alert ends with the app link once, and only once", () => {
    const s = composeBody(["<b>⚠️ Thunderstorm Warning — Perlis</b>"], "https://app.oh-alam.my");
    expect(s.match(/app\.oh-alam\.my/g)!.length).toBe(1);
    expect(s).toContain("App: <a href=\"https://app.oh-alam.my\">");
    expect(s.indexOf('<b>⚠️')).toBeLessThan(s.indexOf("App:"));
  });

  it("a multi-alert batch leads with the count and still has exactly one link", () => {
    const m = composeBody(["<b>A</b>", "<b>B</b>"], "https://app.oh-alam.my");
    expect(m).toContain("2 new alerts for you");
    expect(m.match(/app\.oh-alam\.my/g)!.length).toBe(1);
    expect(m).toContain("<b>A</b>");
    expect(m).toContain("<b>B</b>");
  });

  it("honours the SITE_URL override for the single link", () => {
    const s = composeBody(["<b>A</b>"], "https://staging.example.com");
    expect(s.match(/staging\.example\.com/g)!.length).toBe(1);
  });
});

describe("flood and heavy rain alerts", () => {
  it("states the river alert plainly with level, severity and link", () => {
    const t = floodMsg({ place: "Muar, Johor", station: "Sg. Test", district: "Muar", level: 2.4, severity: "Danger", trend: "Rising", url: "https://ohmyalam.com" });
    expect(t).toContain("River flood alert");
    expect(t).toContain("Sg. Test");
    expect(t).toContain("Level 2.4 m · Danger · Rising");
    expect(t.split("\n").length).toBeLessThanOrEqual(6);
  });
  it("states the heavy-rain value and severity", () => {
    const t = rainMsg({ place: "Muar, Johor", station: "Gauge 1", mmHour: 45, severity: "Heavy", url: "https://ohmyalam.com" });
    expect(t).toContain("Heavy rain");
    expect(t).toContain("45 mm/hr · Heavy");
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
    expect(commands.status("Arau, Perlis", ["AQI", "warnings"])).toContain("I'm watching: AQI, warnings.");
    expect(commands.status("Arau, Perlis", [])).toContain("No alerts switched on yet.");
  });
  it("explains itself and how to stop", () => {
    expect(commands.help()).toContain("/stop");
    expect(commands.stopped()).toContain("Paused");
    expect(commands.welcome()).toContain("/location");
    expect(commands.welcome("Arau, Perlis")).toContain("keep an eye on Arau, Perlis");
  });
  it("keeps a blank line before the command footer and uses bullets", () => {
    const s = commands.status("Arau, Perlis", ["air quality"]);
    expect(s).toMatch(/\n\n<b>Commands<\/b>/);
    expect(s).toContain("• <b>/location</b>");
    expect(s).toContain("• <b>/stop</b>");
    expect(commands.status("Arau, Perlis", ["air quality"], "Air now: Moderate · AQI 60")).toMatch(/\n\n<b>Commands<\/b>/);
  });
  it("formats age and clock without inventing values", () => {
    expect(ago(new Date(Date.now() - 90 * 60_000).toISOString())).toBe("2h ago");
    expect(clock("2026-09-11T18:00:00+08:00")).toMatch(/6:00\s?PM/i);
  });
});
