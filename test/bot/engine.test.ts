import { describe, expect, it } from "vitest";
import { evaluateChat, QUAKE_MIN_MAG } from "../../src/bot/engine.js";
import type { AlertStateRow, ChatSubscription, ObservationRow } from "../../src/store/db.js";

const SUB: ChatSubscription = {
  chatId: 1,
  townSlug: "arau",
  state: "Perlis",
  place: "Arau, Perlis",
  alertTypes: ["aqi", "warning", "quake"],
  enabled: true,
};

const T0 = 1_700_000_000_000; // a fixed "now" so the cooldown is deterministic
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;

const aqi = (value: number): ObservationRow => ({
  source: "doe-eqms",
  station: "PERL-ARA",
  stationName: "Arau",
  measuredAt: iso(T0),
  kind: "aqi",
  value,
  meta: { state: "Perlis", lat: 6.43, lon: 100.27 },
});

const warning = (station: string, heading: string): ObservationRow => ({
  source: "my-met",
  station,
  stationName: "Thunderstorm Warning",
  measuredAt: iso(T0),
  kind: "warning",
  value: 2,
  meta: { headingEn: heading, textEn: heading },
});

const quake = (id: string, mag: number, lat: number, lon: number): ObservationRow => ({
  source: "usgs-eq",
  station: id,
  stationName: "Off the coast of Perlis",
  measuredAt: iso(T0),
  kind: "quake",
  value: mag,
  meta: { lat, lon, depth: 10 },
});

const evalChat = (
  sub: ChatSubscription,
  prev: AlertStateRow[],
  o: { aqi?: ObservationRow[]; warnings?: ObservationRow[]; quakes?: ObservationRow[]; now?: number } = {},
) =>
  evaluateChat({
    sub,
    prev,
    aqi: o.aqi ?? [],
    warnings: o.warnings ?? [],
    quakes: o.quakes ?? [],
    url: "https://ohmyalam.com",
    now: o.now ?? T0,
  });

describe("AQI edge-triggered state machine", () => {
  it("alerts once when a band is first crossed into Unhealthy", () => {
    const r = evalChat(SUB, [], { aqi: [aqi(162)] });
    expect(r.send).toHaveLength(1);
    expect(r.send[0]!.text).toContain("AQI 162");
    expect(r.send[0]!.text).toContain("Unhealthy");
    expect(r.send[0]!.text).toContain("Arau, Perlis");
    expect(r.send[0]!.text).toContain("ohmyalam.com");
    expect(r.next).toHaveLength(1);
    expect(r.next[0]!.lastBand).toBe("Unhealthy");
    expect(r.next[0]!.lastAlertAt).not.toBeNull();
  });

  it("is silent while the same unhealthy band persists — the three-day-haze case", () => {
    const first = evalChat(SUB, [], { aqi: [aqi(162)] });
    const again = evalChat(SUB, first.next, { aqi: [aqi(160)] });
    expect(again.send).toHaveLength(0);
  });

  it("alerts on a real deterioration to a worse band", () => {
    const first = evalChat(SUB, [], { aqi: [aqi(120)] });
    const worse = evalChat(SUB, first.next, { aqi: [aqi(205)] });
    expect(worse.send).toHaveLength(1);
    expect(worse.send[0]!.text).toContain("Very Unhealthy");
  });

  it("sends exactly one recovery notice on the return to clean, then goes quiet", () => {
    const alerted = evalChat(SUB, [], { aqi: [aqi(120)] });
    const recovered = evalChat(SUB, alerted.next, { aqi: [aqi(40)], now: T0 + 10 * MIN });
    expect(recovered.send).toHaveLength(1);
    expect(recovered.send[0]!.text).toContain("improved to 40");
    expect(recovered.send[0]!.text).toContain("clear again");
    expect(recovered.next[0]!.lastRecoveryAt).not.toBeNull();
    // Steady clean afterwards: nothing more.
    const steady = evalChat(SUB, recovered.next, { aqi: [aqi(35)], now: T0 + 11 * MIN });
    expect(steady.send).toHaveLength(0);
  });

  it("records a clean baseline without alerting on first contact", () => {
    const r = evalChat(SUB, [], { aqi: [aqi(40)] });
    expect(r.send).toHaveLength(0);
    expect(r.next[0]!.lastBand).toBe("Good");
  });

  it("cooldown suppresses a re-entry flapping back within the window", () => {
    const alerted = evalChat(SUB, [], { aqi: [aqi(120)] }); // alert at T0
    const recovered = evalChat(SUB, alerted.next, { aqi: [aqi(40)], now: T0 + 10 * MIN });
    // Re-entry only 12 min after the original alert (< 30 min cooldown) — suppressed.
    const reentry = evalChat(SUB, recovered.next, { aqi: [aqi(130)], now: T0 + 12 * MIN });
    expect(reentry.send).toHaveLength(0);
    expect(reentry.next[0]!.lastBand).toBe("Unhealthy"); // state still tracks the level
  });

  it("stays silent when the chat has no station in the chosen state", () => {
    const r = evalChat({ ...SUB, state: "Johor", townSlug: "johor-bahru", place: "Johor Bahru, Johor" }, [], {
      aqi: [aqi(162)], // Perlis station only — not Johor
    });
    expect(r.send).toHaveLength(0);
  });

  it("respects a disabled aqi alert type", () => {
    const sub = { ...SUB, alertTypes: ["warning"] };
    const r = evalChat(sub, [], { aqi: [aqi(162)] });
    expect(r.send).toHaveLength(0);
  });
});

describe("warnings", () => {
  it("alerts a matching warning once and does not re-alert it", () => {
    const r = evalChat(SUB, [], { warnings: [warning("thunder-perlis", "Heavy rain PERLIS")] });
    expect(r.send).toHaveLength(1);
    expect(r.send[0]!.text).toContain("Thunderstorm Warning");
    expect(r.send[0]!.text).toContain("Arau, Perlis");
    const again = evalChat(SUB, r.next, { warnings: [warning("thunder-perlis", "Heavy rain PERLIS")] });
    expect(again.send).toHaveLength(0);
  });

  it("ignores warnings that do not name the chat's place", () => {
    const r = evalChat(SUB, [], { warnings: [warning("thunder-kuching", "Heavy rain KUCHING Sarawak")] });
    expect(r.send).toHaveLength(0);
  });
});

describe("quakes", () => {
  it("alerts a significant nearby quake once per event", () => {
    const r = evalChat(SUB, [], { quakes: [quake("usgA", 5.2, 6.4, 100.2)] });
    expect(r.send).toHaveLength(1);
    expect(r.send[0]!.text).toContain("M 5.2");
    const again = evalChat(SUB, r.next, { quakes: [quake("usgA", 5.2, 6.4, 100.2)] });
    expect(again.send).toHaveLength(0);
  });

  it("silences a quake below the magnitude floor", () => {
    const r = evalChat(SUB, [], { quakes: [quake("usgB", QUAKE_MIN_MAG - 0.3, 6.4, 100.2)] });
    expect(r.send).toHaveLength(0);
  });

  it("silences a quake too far from the place", () => {
    const r = evalChat(SUB, [], { quakes: [quake("usgC", 5.6, 20, 130)] });
    expect(r.send).toHaveLength(0);
  });
});
