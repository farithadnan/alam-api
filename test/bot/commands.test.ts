import { beforeAll, describe, expect, it } from "vitest";
import { Store, DEFAULT_ALERT_TYPES } from "../../src/store/db.js";
import { handleMessage } from "../../src/bot/commands.js";
import { resolveLocality, resolvePayload } from "../../src/bot/resolve.js";

let store: Store;

beforeAll(() => {
  store = new Store(":memory:");
});

const reply = (chatId: number, text: string) => handleMessage({ store }, chatId, text);

describe("place resolution", () => {
  it("resolves a town + state phrase", () => {
    expect(resolveLocality(["arau", "perlis"])?.slug).toBe("arau");
    expect(resolveLocality(["Johor", "Bahru"])?.slug).toBe("johor-bahru");
  });
  it("resolves a deep-link payload", () => {
    expect(resolvePayload("loc_arau_perlis")?.slug).toBe("arau");
    expect(resolvePayload("loc_johor-bahru_johor")?.slug).toBe("johor-bahru");
    expect(resolvePayload("garbage")).toBeNull();
  });
  it("returns null for an unknown place", () => {
    expect(resolveLocality(["atlantis"])).toBeNull();
  });
});

describe("command routing", () => {
  it("/start without a payload welcomes a new chat", () => {
    const text = reply(101, "/start");
    expect(text).toContain("Alam alerts");
    expect(text).toContain("/location");
    expect(store.getSubscription(101)).toBeNull(); // no place yet, no row
  });

  it("/start with a deep-link subscribes and acknowledges the place", () => {
    const text = reply(101, "/start loc_arau_perlis");
    expect(text).toContain("Watching Arau, Perlis");
    const sub = store.getSubscription(101)!;
    expect(sub.townSlug).toBe("arau");
    expect(sub.state).toBe("Perlis");
    expect(sub.enabled).toBe(true);
    expect(sub.alertTypes).toEqual(DEFAULT_ALERT_TYPES);
  });

  it("/location sets the place and keeps it in status", () => {
    const set = reply(102, "/location johor bahru");
    expect(set).toContain("Location set to Johor Bahru, Johor");
    const st = reply(102, "/status");
    expect(st).toContain("Johor Bahru, Johor");
    expect(st).toContain("Alerts on: air quality, warnings, earthquakes");
  });

  it("/location with no argument prompts", () => {
    expect(reply(200, "/location")).toContain("Where should I alert you?");
  });

  it("/location for an unknown place says so", () => {
    expect(reply(200, "/location atlantis")).toContain('I don\'t know "atlantis"');
  });

  it("/status prompts when not subscribed", () => {
    expect(reply(999, "/status")).toContain("Where should I alert you?");
  });

  it("/status shows the live air quality for the place when a reading exists", () => {
    reply(300, "/location pasir gudang");
    store.ingest([
      { source: "doe-eqms", station: "CA34J", stationName: "Pasir Gudang", measuredAt: "2026-09-12T04:00:00", kind: "aqi", value: 82, meta: { state: "Johor" } },
    ]);
    const st = reply(300, "/status");
    expect(st).toContain("Pasir Gudang, Johor");
    expect(st).toContain("Air now: Moderate · AQI 82");
    expect(st).toContain("Alerts on: air quality, warnings, earthquakes");
  });

  it("/stop disables an existing chat, /start re-enables", () => {
    reply(103, "/start loc_arau_perlis");
    expect(store.getSubscription(103)!.enabled).toBe(true);
    const stopped = reply(103, "/stop");
    expect(stopped).toContain("Alerts off");
    expect(store.getSubscription(103)!.enabled).toBe(false);
    expect(reply(103, "/status")).toContain("Alerts off");
    reply(103, "/start loc_arau_perlis");
    expect(store.getSubscription(103)!.enabled).toBe(true);
  });

  it("/alerts with no argument lists current types", () => {
    reply(200, "/start loc_arau_perlis");
    expect(reply(200, "/alerts")).toContain("Alerts on:");
  });

  it("/alerts aqi flood switches to just those", () => {
    reply(200, "/alerts aqi flood");
    expect(store.getSubscription(200)!.alertTypes).toEqual(["aqi", "flood"]);
  });

  it("/alerts +quake / -warnings toggles individually", () => {
    reply(200, "/alerts all"); // deterministic starting point
    reply(200, "/alerts +quake -warnings");
    expect(store.getSubscription(200)!.alertTypes).toEqual(["aqi", "quake", "flood"]);
  });

  it("/alerts all restores defaults, none clears", () => {
    reply(200, "/alerts all");
    expect(store.getSubscription(200)!.alertTypes).toEqual(DEFAULT_ALERT_TYPES);
    reply(200, "/alerts none");
    expect(store.getSubscription(200)!.alertTypes).toEqual([]);
  });

  it("/alerts prompts when not subscribed", () => {
    expect(reply(777, "/alerts")).toContain("Where should I alert you?");
  });

  it("/help lists the commands", () => {
    expect(reply(1, "/help")).toContain("/stop");
    expect(reply(1, "/help")).toContain("/location");
  });

  it("/test sends a sample alert for a subscribed chat", () => {
    reply(104, "/start loc_arau_perlis");
    const t = reply(104, "/test");
    expect(t).toContain("test alert");
    expect(t).toContain("Arau, Perlis");
  });

  it("is silent on non-commands", () => {
    expect(reply(1, "hello there")).toBeNull();
  });

  it("answers an unknown command", () => {
    expect(reply(1, "/flibble")).toContain("did not catch that");
  });
});
