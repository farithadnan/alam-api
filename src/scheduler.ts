import type { Store } from "./store/db.js";
import type { Adapter } from "./adapters/types.js";

type Log = (msg: string) => void;

/** How many adapters may poll at once. Cross-host parallelism; same host stays queued. */
const POLL_CONCURRENCY = 4;

/**
 * Bounded concurrency: at most `limit` tasks at once, results in input order.
 * Used for the poll cycle so different hosts are fetched in parallel while the
 * fetch layer keeps same-host calls serialised. A cold start used to take minutes
 * because every adapter waited for the one before it.
 */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i] as T);
  });
  await Promise.all(workers);
  return out;
}

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
  concurrency = POLL_CONCURRENCY,
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
    const started = Date.now();
    const results = await mapLimit(adapters, concurrency, (a) => runOnce(a));
    const polled = results.filter(Boolean).length;
    if (polled < adapters.length) log(`[scheduler] ${adapters.length - polled} source(s) still fresh, skipped`);
    log(`[scheduler] cycle done: ${polled} polled in ${Date.now() - started}ms`);
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
