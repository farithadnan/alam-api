import { loadConfig } from "./util/config.js";
import { Store } from "./store/db.js";
import { DoeEqmsAdapter } from "./adapters/doeEqms.js";
import { ingestOnce } from "./scheduler.js";

const cfg = loadConfig();
const store = new Store(cfg.DB_PATH);

try {
  await ingestOnce(store, new DoeEqmsAdapter(cfg.EQMS_STATE_ID), (m) => console.log(m));
  const latest = store.latestBySource("doe-eqms");
  for (const o of latest) {
    console.log(`  ${o.station.padEnd(10)} API=${String(o.value).padStart(3)}  ${o.stationName}`);
  }
} finally {
  store.close();
}
