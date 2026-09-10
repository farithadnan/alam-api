import type { Store } from "./store/db.js";
import type { Adapter } from "./adapters/types.js";

type Log = (msg: string) => void;

/**
 * Polls every adapter on its own interval. Overlapping runs for the same adapter
 * are skipped (no concurrent poll of one source). Failures are logged and the
 * previous data stays served — the store makes reads resilient to upstream blips.
 */
export function startScheduler(
  store: Store,
  adapters: Adapter[],
  intervalMs: (id: string) => number,
  log: Log,
  pruneDays = 90,
): () => void {
  const inFlight = new Set<string>();

  async function runOnce(adapter: Adapter) {
    if (inFlight.has(adapter.id)) return;
    inFlight.add(adapter.id);
    const start = Date.now();
    try {
      const rows = await adapter.poll();
      const inserted = store.ingest(rows);
      log(`[${adapter.id}] ${rows.length} parsed, ${inserted} new, ${Date.now() - start}ms`);
    } catch (err) {
      log(`[${adapter.id}] poll failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      inFlight.delete(adapter.id);
    }
  }

  async function runAll() {
    for (const a of adapters) await runOnce(a);
    store.pruneOlderThan(pruneDays);
  }

  void runAll(); // immediate first ingest, then on the interval

  const timers = adapters.map((a) => setInterval(() => void runOnce(a), intervalMs(a.id)));
  return () => timers.forEach((t) => clearInterval(t));
}

/** One-shot ingest for tests/cron. */
export async function ingestOnce(store: Store, adapter: Adapter, log: Log) {
  const rows = await adapter.poll();
  const inserted = store.ingest(rows);
  log(`[${adapter.id}] ${rows.length} parsed, ${inserted} new`);
}
