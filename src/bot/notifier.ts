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

type Log = (msg: string) => void;

/** Skip rewriting a state row that is still the same decision (band + timestamps). */
const stateEqual = (a: AlertStateRow, b: AlertStateRow): boolean =>
  a.kind === b.kind &&
  a.key === b.key &&
  a.lastBand === b.lastBand &&
  a.lastAlertAt === b.lastAlertAt &&
  a.lastRecoveryAt === b.lastRecoveryAt;

/** One evaluation pass: fetch once, evaluate every enabled chat, send + persist. */
async function runCycle(client: TelegramClient, store: Store, url: string, log: Log): Promise<void> {
  const subs = store.getSubscriptions(true);
  if (!subs.length) return;
  const aqi = store.latestBySource("doe-eqms").filter((r) => r.kind === "aqi");
  const warnings = store.latestByKind("warning");
  const quakes = store.latestByKind("quake");

  let sent = 0;
  for (const sub of subs) {
    const prev = store.alertStateForChat(sub.chatId);
    const res = evaluateChat({ sub, prev, aqi, warnings, quakes, url });
    for (const m of res.send) {
      try {
        await client.sendMessage(m.chatId, m.text);
        sent++;
      } catch (err) {
        log(`[notifier] send failed for chat ${m.chatId}: ${err instanceof Error ? err.message : String(err)}`);
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
  void cycle(); // first pass as soon as the token is validated

  return stop;
}
