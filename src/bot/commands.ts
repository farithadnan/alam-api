/**
 * Command dispatch for the bot.
 *
 * Pure-ish: given the chat's text, it returns the reply to send (or null to stay
 * silent) and makes the store writes a command implies (subscribe, move, stop).
 * The pump calls this and sends the reply, so the whole routing policy is testable
 * without Telegram or the network.
 */

import { commands } from "../core/messages.js";
import { MALAYSIA_LOCALITIES } from "../core/localities.js";
import { aqiBand } from "../core/bands.js";
import { DEFAULT_ALERT_TYPES } from "./defaults.js";
import type { Store } from "../store/db.js";
import { resolveLocality, resolvePayload } from "./resolve.js";
import { pickAqiStation } from "./engine.js";

export interface CommandContext {
  store: Store;
}

const labelFor = (t: string): string =>
  ({ aqi: "air quality", warning: "warnings", quake: "earthquakes", flood: "river & rain" })[t] ?? t;

const commandOf = (t: string): { name: string; arg: string } | null => {
  if (!t.startsWith("/")) return null;
  const [name, ...rest] = t.split(/\s+/);
  return { name: name?.toLowerCase() ?? "", arg: rest.join(" ").trim() };
};

/**
 * Route one message to its command handler. Returns the reply text, or null when the
 * message is not a command (the bot stays quiet rather than replying to small talk).
 */
export function handleMessage(ctx: CommandContext, chatId: number, text?: string | null): string | null {
  const raw = (text ?? "").trim();
  if (!raw.startsWith("/")) return null;
  const cmd = commandOf(raw);
  if (!cmd) return commands.unknown();
  const { store } = ctx;

  switch (cmd.name) {
    case "/start": {
      const loc = cmd.arg ? resolvePayload(cmd.arg) : null;
      if (loc) {
        store.upsertSubscription({
          chatId,
          townSlug: loc.slug,
          state: loc.state,
          place: `${loc.name}, ${loc.state}`,
          alertTypes: DEFAULT_ALERT_TYPES,
          enabled: true,
        });
        return commands.welcome(`${loc.name}, ${loc.state}`);
      }
      const sub = store.getSubscription(chatId);
      return commands.welcome(sub?.place ?? null);
    }

    case "/location": {
      if (!cmd.arg) return commands.locationPrompt();
      const loc = resolveLocality(cmd.arg.split(/\s+/));
      if (!loc) return commands.locationUnknown(cmd.arg);
      const existing = store.getSubscription(chatId);
      store.upsertSubscription({
        chatId,
        townSlug: loc.slug,
        state: loc.state,
        place: `${loc.name}, ${loc.state}`,
        alertTypes: existing?.alertTypes.length ? existing.alertTypes : DEFAULT_ALERT_TYPES,
        enabled: existing?.enabled ?? true,
      });
      return commands.locationSet(`${loc.name}, ${loc.state}`);
    }

    case "/status": {
      const sub = store.getSubscription(chatId);
      if (!sub) return commands.locationPrompt();
      if (!sub.enabled) return commands.stopped();
      const station = pickAqiStation(sub, store.latestBySource("doe-eqms").filter((r) => r.kind === "aqi"));
      const condition = station
        ? `Air now: ${aqiBand(station.value).label} · AQI ${Math.round(station.value)}`
        : null;
      return commands.status(sub.place, sub.alertTypes.map(labelFor).filter(Boolean), condition);
    }

    case "/alerts": {
      const sub = store.getSubscription(chatId);
      if (!sub) return commands.locationPrompt();
      const TOKEN: Record<string, string[]> = {
        aqi: ["aqi", "air", "airquality"],
        warning: ["warning", "warn", "warnings"],
        quake: ["quake", "earthquake", "earthquakes"],
        flood: ["flood", "floods", "rain", "river"],
      };
      const tokens = cmd.arg.toLowerCase().split(/[,\s]+/).filter(Boolean);
      if (!tokens.length) return commands.alertsShow(sub.alertTypes.map(labelFor));
      if (tokens.length === 1 && tokens[0] === "all") {
        store.setChatAlertTypes(chatId, [...DEFAULT_ALERT_TYPES]);
        return commands.alertsShow(DEFAULT_ALERT_TYPES.map(labelFor));
      }
      if (tokens.length === 1 && tokens[0] === "none") {
        store.setChatAlertTypes(chatId, []);
        return commands.alertsShow([]);
      }
      // A bare list (e.g. "aqi flood") replaces the selection; +x / -x toggle on top.
      const hasBare = tokens.some((t) => !t.startsWith("+") && !t.startsWith("-"));
      const next = new Set<string>(hasBare ? [] : sub.alertTypes);
      for (const t of tokens) {
        const rem = t.startsWith("-");
        const key = t.replace(/^[+-]/, "");
        const type = Object.keys(TOKEN).find((k) => (TOKEN as Record<string, string[]>)[k]?.includes(key));
        if (!type) continue;
        if (rem) next.delete(type);
        else next.add(type); // a bare token (or +token) switches it on
      }
      store.setChatAlertTypes(chatId, [...next]);
      return commands.alertsShow([...next].map(labelFor));
    }

    case "/stop": {
      if (store.getSubscription(chatId)) store.setChatEnabled(chatId, false);
      return commands.stopped();
    }

    case "/help":
      return commands.help();

    case "/test": {
      // Dev-only self-check: echo a sample alert to the chat that asked.
      const sub = store.getSubscription(chatId);
      if (!sub?.enabled) return commands.locationPrompt();
      return commands.debug(sub.place);
    }

    default:
      return commands.unknown();
  }
}
