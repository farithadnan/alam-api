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
    expect(text).toContain("Currently watching Arau, Perlis");
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
    expect(st).toContain("Alerts on: AQI, warnings, quakes");
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
