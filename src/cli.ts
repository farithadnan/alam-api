import { loadConfig } from "./util/config.js";
import { Store } from "./store/db.js";
import { buildAdapters } from "./adapters/registry.js";
import { ingestOnce } from "./scheduler.js";

const cfg = loadConfig();
const store = new Store(cfg.DB_PATH);

try {
  for (const adapter of buildAdapters(cfg)) {
    await ingestOnce(store, adapter, (m) => console.log(m));
  }
  console.log("--- latest per source ---");
  const sources = store.stations().reduce<string[]>((acc, s) => (acc.includes(s.source) ? acc : [...acc, s.source]), []);
  for (const source of sources) {
    const rows = store.latestBySource(source);
    console.log(`[${source}] ${rows.length} rows`);
    for (const o of rows.slice(0, 9)) {
      console.log(`   ${o.stationName ?? o.station}  ${o.kind}=${o.value}  (${o.measuredAt})`);
    }
  }
} finally {
  store.close();
}
