import { loadConfig, cadenceFor } from "./util/config.js";
import { Store } from "./store/db.js";
import { buildAdapters, resolveStates } from "./adapters/registry.js";
import { DoeEqmsAdapter } from "./adapters/doeEqms.js";
import { ingestOnce } from "./scheduler.js";

const cfg = loadConfig();
const store = new Store(cfg.DB_PATH);
const log = (m: string) => console.log(m);

/**
 * Seed real multi-day AQI history.
 *
 * The DOE hourly endpoint accepts a `datetime`, so we can walk back day by day
 * and ingest each day's 24 hourly readings per station. Prices: one request per
 * state per day. Run once; the scheduler keeps it current afterwards.
 *
 *   npm run backfill -- 7        # backfill 7 days
 */
async function backfill(days: number) {
  const adapter = new DoeEqmsAdapter(resolveStates(cfg));
  let total = 0;
  for (let d = 1; d <= days; d++) {
    const at = new Date(Date.now() + 8 * 3_600_000 - d * 86_400_000).toISOString().slice(0, 10);
    const rows = await adapter.poll(`${at}T23:00:00`);
    const inserted = store.ingest(rows);
    total += inserted;
    log(`[backfill] ${at}: ${rows.length} parsed, ${inserted} new`);
  }
  log(`[backfill] done — ${total} rows added`);
}

try {
  const cmd = process.argv[2];
  if (cmd === "backfill") {
    const days = Math.min(Math.max(Number(process.argv[3] ?? 7) || 7, 1), 30);
    await backfill(days);
  } else {
    // Respect the poll intervals by default: re-polling everything on every run is
    // what hammered the free upstreams. `npm run ingest -- --force` overrides.
    const force = process.argv.includes("--force");
    const cadence = cadenceFor(cfg);
    for (const adapter of buildAdapters(cfg)) {
      if (!force && !store.isStale(adapter.id, cadence(adapter.id))) {
        log(`[${adapter.id}] fresh, skipped (use --force)`);
        continue;
      }
      await ingestOnce(store, adapter, log, false);
    }
    log("--- latest per source ---");
    const sources = store.stations().reduce<string[]>((acc, s) => (acc.includes(s.source) ? acc : [...acc, s.source]), []);
    for (const source of sources) {
      const rows = store.latestBySource(source);
      log(`[${source}] ${rows.length} rows`);
      for (const o of rows.slice(0, 9)) {
        log(`   ${o.stationName ?? o.station}  ${o.kind}=${o.value}  (${o.measuredAt})`);
      }
    }
  }
} finally {
  store.close();
}
