/**
 * Notifier boot: wires the Telegram bot (long-poll commands) and the alert pump
 * (edge-triggered evaluation) to the snapshot store. The alert pump runs on the
 * same cadence as the DOE poll, so it never races a half-refreshed dataset.
 *
 * Token is optional: with TELEGRAM_BOT_TOKEN unset the rest of the API runs
 * exactly as before — the notifier simply never starts.
 */

import type { Config } from "../util/config.js";
import type { Store, AlertStateRow } from "../store/db.js";
import { TelegramClient, runPump } from "./telegram.js";
import { handleMessage } from "./commands.js";
import { evaluateChat } from "./engine.js";
import { siteLink } from "../core/messages.js";

type Log = (msg: string) => void;

const MY_OFFSET_MS = 8 * 3_600_000;

/** Malaysia local hour (0-23) for a timestamp — the quiet window is judged in MY time. */
export const malaysiaHour = (now: number): number => new Date(now + MY_OFFSET_MS).getUTCHours();

/**
 * True when a Malaysia-local hour falls inside the quiet window. A window that does
 * not cross midnight (e.g. 2-6) is inclusive-start/exclusive-end within the day; a
 * window that crosses midnight (e.g. 23-7) also covers the early hours. An equal
 * start/end disables quiet hours entirely.
 */
export function quietActive(now: number, start: number, end: number): boolean {
  if (start === end) return false;
  const h = malaysiaHour(now);
  return start < end ? h >= start && h < end : h >= start || h < end;
}

/** Skip rewriting a state row that is still the same decision (band + timestamps). */
const stateEqual = (a: AlertStateRow, b: AlertStateRow): boolean =>
  a.kind === b.kind &&
  a.key === b.key &&
  a.lastBand === b.lastBand &&
  a.lastAlertAt === b.lastAlertAt &&
  a.lastRecoveryAt === b.lastRecoveryAt;

/**
 * One notification = the alert topics joined, then the app link ONCE at the end. So a
 * multi-alert cycle reads as a single summary with one place to go, never a URL under
 * every topic.
 */
export function composeBody(texts: string[], url: string): string {
  const head = texts.length === 1 ? "" : `🔔 ${texts.length} new alerts for you\n\n`;
  return `${head}${texts.join("\n\n")}\n\n${siteLink(url)}`;
}

/** One evaluation pass: fetch once, evaluate every enabled chat, send + persist. */
export async function runCycle(client: TelegramClient, store: Store, url: string, log: Log): Promise<void> {
  const subs = store.getSubscriptions(true);
  if (!subs.length) return;
  const aqi = store.latestBySource("doe-eqms").filter((r) => r.kind === "aqi");
  const warnings = store.latestByKind("warning");
  const quakes = store.latestByKind("quake");
  const flood = store.latestByKind("flood");
  const rainfall = store.latestByKind("rainfall");

  let sent = 0;
  for (const sub of subs) {
    const prev = store.alertStateForChat(sub.chatId);
    const res = evaluateChat({ sub, prev, aqi, warnings, quakes, flood, rainfall, url });
    // Batch: a chat with several new alerts in one pass gets ONE composed message,
    // so a multiple-alert cycle reads as a summary instead of a burst of DMs.
    const texts = res.send.map((m) => m.text);
    if (texts.length) {
      try {
        await client.sendMessage(sub.chatId, composeBody(texts, url));
        sent++;
      } catch (err) {
        log(`[notifier] send failed for chat ${sub.chatId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // Persist regardless of a send failure so a permanently-blocked chat does not
    // get the same alert re-queued every cycle.
    const prevMap = new Map(prev.map((r) => [`${r.kind}:${r.key}`, r]));
    for (const row of res.next) {
      const before = prevMap.get(`${row.kind}:${row.key}`);
      if (before && stateEqual(before, row)) continue;
      store.setAlertState(row);
    }
  }
  log(`[notifier] cycle: ${subs.length} chat(s), ${sent} alert(s) sent`);
}

export function startNotifier(cfg: Config, store: Store, log: Log): () => void {
  const token = cfg.TELEGRAM_BOT_TOKEN;
  if (!token) {
    log("[notifier] no TELEGRAM_BOT_TOKEN — alerts disabled");
    return () => {};
  }
  const client = new TelegramClient(token, log);
  const ctx = { store };
  const timers: ReturnType<typeof setInterval>[] = [];

  // Fail fast on a bad token before any polling starts.
  let stopped = false;
  let booted = false;
  client
    .getMe()
    .then((u) => {
      booted = true;
      log(`[notifier] bot online as @${u}`);
      void cycle(); // settle the silent baseline as soon as the token is valid
    })
    .catch((err) => {
      log(`[notifier] token rejected (${err instanceof Error ? err.message : String(err)}) — alerts disabled`);
      stopped = true;
    });

  function stop(): void {
    stopped = true;
    for (const t of timers) clearInterval(t);
  }

  // Long-poll command pump.
  void runPump(
    client,
    async (update) => {
      if (stopped) return;
      const chatId = update.message?.chat?.id;
      const text = update.message?.text;
      if (!chatId) return;
      const reply = handleMessage(ctx, chatId, text);
      if (reply) await client.sendMessage(chatId, reply);
    },
    log,
  );

  // Alert pump: one pass on boot, then on the DOE cadence. Never overlaps itself.
  let evaluating = false;
  async function cycle(): Promise<void> {
    if (stopped || !booted || evaluating) return;
    if (quietActive(Date.now(), cfg.ALERT_QUIET_START, cfg.ALERT_QUIET_END)) return; // overnight: stay silent
    evaluating = true;
    try {
      await runCycle(client, store, cfg.SITE_URL, log);
    } catch (err) {
      log(`[notifier] cycle error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      evaluating = false;
    }
  }
  timers.push(setInterval(() => void cycle(), Math.max(30_000, cfg.POLL_SECONDS * 1000)));

  return stop;
}
