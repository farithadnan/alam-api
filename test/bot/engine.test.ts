import { describe, expect, it } from "vitest";
import { evaluateChat, QUAKE_MIN_MAG, warningKey } from "../../src/bot/engine.js";
import type { AlertStateRow, ChatSubscription, ObservationRow } from "../../src/store/db.js";

const SUB: ChatSubscription = {
  chatId: 1,
  townSlug: "arau",
  state: "Perlis",
  place: "Arau, Perlis",
  alertTypes: ["aqi", "warning", "quake"],
  enabled: true,
};

const T0 = 1_700_000_000_000;
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

const warning = (station: string, heading: string, issued = T0): ObservationRow => ({
  source: "my-met",
  station,
  stationName: "Thunderstorms Warning",
  measuredAt: iso(issued),
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
  o: { aqi?: ObservationRow[]; warnings?: ObservationRow[]; quakes?: ObservationRow[]; flood?: ObservationRow[]; rainfall?: ObservationRow[]; now?: number } = {},
) =>
  evaluateChat({
    sub,
    prev,
    aqi: o.aqi ?? [],
    warnings: o.warnings ?? [],
    quakes: o.quakes ?? [],
    flood: o.flood ?? [],
    rainfall: o.rainfall ?? [],
    url: "https://ohmyalam.com",
    now: o.now ?? T0,
  });

describe("AQI edge-triggered state machine", () => {
  it("baselines silently when first contact is clean, then alerts on the crossing", () => {
    const r1 = evalChat(SUB, [], { aqi: [aqi(40)] });
    expect(r1.send).toHaveLength(0); // settle in, no history to report
    expect(r1.next[0]!.lastBand).toBe("Good");
    const r2 = evalChat(SUB, r1.next, { aqi: [aqi(162)] });
    expect(r2.send).toHaveLength(1);
    expect(r2.send[0]!.text).toContain("AQI 162");
    expect(r2.send[0]!.text).toContain("Unhealthy");
    expect(r2.send[0]!.text).toContain("Arau, Perlis");
    // The link is no longer repeated per topic — it is appended once by the notifier.
    expect(r2.send[0]!.text).not.toContain("ohmyalam.com");
  });

  it("surfaces ONE current-condition alert when first contact is already unhealthy", () => {
    const r = evalChat(SUB, [], { aqi: [aqi(120)] });
    expect(r.send).toHaveLength(1); // current truth, once — not a history dump
    expect(r.next[0]!.lastBand).toBe("Unhealthy");
    expect(r.next[0]!.lastAlertAt).not.toBeNull();
  });

  it("is silent while the same unhealthy band persists — the three-day-haze case", () => {
    const first = evalChat(SUB, [], { aqi: [aqi(120)] });
    const again = evalChat(SUB, first.next, { aqi: [aqi(130)] });
    const later = evalChat(SUB, again.next, { aqi: [aqi(115)] });
    expect(again.send).toHaveLength(0);
    expect(later.send).toHaveLength(0);
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
    const steady = evalChat(SUB, recovered.next, { aqi: [aqi(35)], now: T0 + 11 * MIN });
    expect(steady.send).toHaveLength(0);
  });

  it("cooldown suppresses a re-entry flapping back within the window", () => {
    const alerted = evalChat(SUB, [], { aqi: [aqi(120)] }); // 1 current alert at T0
    const recovered = evalChat(SUB, alerted.next, { aqi: [aqi(40)], now: T0 + 3 * MIN });
    expect(recovered.send).toHaveLength(1);
    // Re-entry 8 min after the original alert (< 30 min cooldown) — suppressed.
    const reentry = evalChat(SUB, recovered.next, { aqi: [aqi(130)], now: T0 + 8 * MIN });
    expect(reentry.send).toHaveLength(0);
    expect(reentry.next[0]!.lastBand).toBe("Unhealthy"); // state still tracks the level
    // After the cooldown, a real deterioration informs again.
    const later = evalChat(SUB, reentry.next, { aqi: [aqi(205)], now: T0 + 60 * MIN });
    expect(later.send).toHaveLength(1);
  });

  it("stays silent when the chat has no station in the chosen state", () => {
    const r = evalChat({ ...SUB, state: "Johor", townSlug: "johor-bahru", place: "Johor Bahru, Johor" }, [], {
      aqi: [aqi(162)],
    });
    expect(r.send).toHaveLength(0);
  });

  it("respects a disabled aqi alert type", () => {
    const r = evalChat({ ...SUB, alertTypes: ["warning"] }, [], { aqi: [aqi(162)] });
    expect(r.send).toHaveLength(0);
  });
});

describe("warnings", () => {
  it("does NOT dump a backlog of historical warnings on first contact (the burst regression)", () => {
    // Several old issuances already in the feed: a fresh chat must not replay them.
    const r = evalChat(SUB, [], {
      warnings: [
        warning("thunder", "Heavy rain PERLIS", T0 - 2 * 24 * 3600 * 1000),
        warning("thunder", "Heavy rain PERLIS", T0 - 30 * 3600 * 1000),
        warning("thunder", "Heavy rain PERLIS", T0 - 5 * 3600 * 1000),
      ],
    });
    expect(r.send).toHaveLength(0); // all folded quietly into the baseline
    expect(r.next).toHaveLength(3); // each distinct issuance is remembered
  });

  it("alerts only a NEW issuance after the baseline, once, and once per issuance", () => {
    const old = warning("thunder", "Heavy rain PERLIS", T0 - 3600 * 1000);
    let prev: AlertStateRow[] = [];
    const baseline = evalChat(SUB, prev, { warnings: [old] }); // cold start: silent
    expect(baseline.send).toHaveLength(0);
    prev = prev.concat(baseline.next);

    const fresh = warning("thunder", "Heavy rain PERLIS", T0 + 3600 * 1000);
    const r = evalChat(SUB, prev, { warnings: [old, fresh] });
    expect(r.send).toHaveLength(1); // only the fresh issuance
    expect(r.send[0]!.text).toContain("Thunderstorms Warning");
    expect(r.send[0]!.text).toContain("Arau, Perlis");
    expect(warningKey(fresh)).not.toBe(warningKey(old));
    prev = prev.concat(r.next);

    // Same set again: nothing new, no re-alert.
    const again = evalChat(SUB, prev, { warnings: [old, fresh] });
    expect(again.send).toHaveLength(0);
  });

  it("alerts each distinct issuance once within a single pass", () => {
    const a = warning("a-warn", "Heavy rain PERLIS", T0 + 1 * 3600 * 1000);
    const b = warning("b-warn", "Strong wind PERLIS", T0 + 2 * 3600 * 1000);
    const first = evalChat(SUB, [], { warnings: [warning("x", "Heavy rain PERLIS", T0 - 1000)] });
    const r = evalChat(SUB, first.next, { warnings: [a, b] });
    expect(r.send).toHaveLength(2); // two distinct new issuances, exactly two messages
  });

  it("ignores warnings that do not name the chat's place", () => {
    const r = evalChat(SUB, [], { warnings: [warning("thunder-kuching", "Heavy rain KUCHING Sarawak", T0 + 1000)] });
    expect(r.send).toHaveLength(0);
  });
});

describe("quakes", () => {
  it("baselines existing quakes silently, alerts a new nearby quake once", () => {
    const baseline = evalChat(SUB, [], { quakes: [quake("usgA", 5.2, 6.4, 100.2)] });
    expect(baseline.send).toHaveLength(0);

    const r = evalChat(SUB, baseline.next, { quakes: [quake("usgA", 5.2, 6.4, 100.2), quake("usgB", 5.3, 6.5, 100.3)] });
    expect(r.send).toHaveLength(1); // only the new event usgB
    expect(r.send[0]!.text).toContain("M 5.3");

    const again = evalChat(SUB, r.next, { quakes: [quake("usgB", 5.3, 6.5, 100.3)] });
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

describe("InfoBanjir flood + heavy rain", () => {
  const JOHOR = { ...SUB, state: "Johor", townSlug: "pasir-gudang", place: "Pasir Gudang, Johor", alertTypes: ["flood"] };
  const river = (station = "ST-A"): ObservationRow => ({
    source: "infobanjir", station, stationName: "Sg. Test", measuredAt: iso(T0), kind: "flood", value: 2.4,
    meta: { state: "Johor", district: "Johor Bahru", severity: "Danger", trend: "Rising", lat: 1.5, lon: 103.9 },
  });
  const rain = (station = "RF-A"): ObservationRow => ({
    source: "infobanjir", station, stationName: "Rain Gauge 1", measuredAt: iso(T0), kind: "rainfall", value: 45,
    meta: { state: "Johor", district: "Johor Bahru", severity: "Heavy", lat: 1.5, lon: 103.9 },
  });

  it("baselines existing alerts silently, dedups while present, and re-alerts after they clear", () => {
    let prev: AlertStateRow[] = [];
    // Cold start: the feed's existing alerts are folded in quietly (no dump).
    let r = evalChat(JOHOR, prev, { flood: [river()] });
    expect(r.send).toHaveLength(0);
    prev = prev.concat(r.next);
    // Still present: no repeat.
    r = evalChat(JOHOR, prev, { flood: [river()] });
    expect(r.send).toHaveLength(0);
    prev = prev.concat(r.next);
    // Station left the feed (cleared): record resets.
    r = evalChat(JOHOR, prev, { flood: [] });
    expect(r.send).toHaveLength(0);
    prev = prev.concat(r.next);
    // Recurrence: alerts again, once.
    r = evalChat(JOHOR, prev, { flood: [river()] });
    expect(r.send).toHaveLength(1);
    expect(r.send[0]!.text).toContain("River flood alert");
    expect(r.send[0]!.text).toContain("Sg. Test");
    expect(r.send[0]!.text).toContain("Danger");
  });

  it("alerts heavy rain once per station, deduped while present", () => {
    const r1 = evalChat(JOHOR, [], { rainfall: [rain("RF-OLD")] }); // cold start baseline
    expect(r1.send).toHaveLength(0);
    // A NEW station appears after the baseline: it alerts, once.
    const r2 = evalChat(JOHOR, r1.next, { rainfall: [rain("RF-OLD"), rain("RF-NEW")] });
    expect(r2.send).toHaveLength(1);
    expect(r2.send[0]!.text).toContain("Heavy rain");
    expect(r2.send[0]!.text).toContain("45");
    // Still present: no repeat.
    const again = evalChat(JOHOR, r2.next, { rainfall: [rain("RF-NEW")] });
    expect(again.send).toHaveLength(0);
  });

  it("ignores flood alerts for another state", () => {
    const PERLIS = { ...JOHOR, state: "Perlis", townSlug: "arau", place: "Arau, Perlis", alertTypes: ["flood"] };
    const r = evalChat(PERLIS, [], { flood: [river()] }); // river() is Johor
    expect(r.send).toHaveLength(0);
  });

  it("ignores a same-state flood alert too far from the town", () => {
    // Settle the baseline with a near river (cold start sends nothing).
    let prev: AlertStateRow[] = [];
    let r = evalChat(JOHOR, prev, { flood: [river()] });
    expect(r.send).toHaveLength(0);
    prev = prev.concat(r.next);
    // Same state, but ~160 km away (Muar): must NOT alert the Pasir Gudang user.
    const far = { ...river("ST-FAR"), meta: { ...river().meta, district: "Muar", lat: 2.05, lon: 102.57 } };
    r = evalChat(JOHOR, prev, { flood: [river(), far] });
    expect(r.send).toHaveLength(0);
  });
});
