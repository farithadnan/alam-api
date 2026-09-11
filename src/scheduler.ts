import type { Store } from "./store/db.js";
import type { Adapter } from "./adapters/types.js";

type Log = (msg: string) => void;

/**
 * Polls every adapter on its own interval. Overlapping runs for the same adapter
 * are skipped (no concurrent poll of one source). Failures are logged and the
 * previous data stays served — the store makes reads resilient to upstream blips.
 *
 * The first pass is staleness-aware: an adapter whose last recorded poll is still
 * within its interval is skipped rather than re-fetched. That is what stops a
 * restart (or a dev-server reload) from re-polling every upstream endpoint.
 */
export function startScheduler(
  store: Store,
  adapters: Adapter[],
  intervalMs: (id: string) => number,
  log: Log,
  pruneDays = 90,
): () => void {
  const inFlight = new Set<string>();

  async function runOnce(adapter: Adapter): Promise<boolean> {
    if (inFlight.has(adapter.id)) return false;
    if (!store.isStale(adapter.id, intervalMs(adapter.id))) return false; // still fresh
    inFlight.add(adapter.id);
    const start = Date.now();
    try {
      const rows = await adapter.poll();
      const inserted = store.ingest(rows);
      store.recordPoll(adapter.id, inserted);
      log(`[${adapter.id}] ${rows.length} parsed, ${inserted} new, ${Date.now() - start}ms`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      store.recordPoll(adapter.id, 0, message);
      log(`[${adapter.id}] poll failed: ${message}`);
      return false;
    } finally {
      inFlight.delete(adapter.id);
    }
  }

  async function runAll() {
    let polled = 0;
    for (const a of adapters) if (await runOnce(a)) polled++;
    if (polled < adapters.length) log(`[scheduler] ${adapters.length - polled} source(s) still fresh, skipped`);
    store.pruneOlderThan(pruneDays);
  }

  void runAll(); // immediate first ingest, then on the interval

  const timers = adapters.map((a) => setInterval(() => void runOnce(a), intervalMs(a.id)));
  return () => timers.forEach((t) => clearInterval(t));
}

/** One-shot ingest for tests/cron. */
/** One-shot ingest for tests/cron. Records the poll so freshness tracking stays true. */
export async function ingestOnce(store: Store, adapter: Adapter, log: Log, force = true) {
  const rows = await adapter.poll();
  const inserted = store.ingest(rows);
  store.recordPoll(adapter.id, inserted);
  log(`[${adapter.id}] ${rows.length} parsed, ${inserted} new${force ? "" : " (interval elapsed)"}`);
}
