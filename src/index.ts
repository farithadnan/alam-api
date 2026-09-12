import fs from "node:fs";
import { loadConfig, cadenceFor } from "./util/config.js";
import { Store } from "./store/db.js";
import { buildAdapters } from "./adapters/registry.js";
import { buildServer } from "./http/server.js";
import { startScheduler } from "./scheduler.js";
import { startNotifier } from "./bot/notifier.js";

const cfg = loadConfig();
const store = new Store(cfg.DB_PATH);
const adapters = buildAdapters(cfg);

const app = buildServer(store, cfg.DASHBOARD_DIST);
const cadence = cadenceFor(cfg);
const stop = startScheduler(store, adapters, cadence, (m) => app.log.info(m));
const stopNotifier = startNotifier(cfg, store, (m) => app.log.info(m));

try {
  await app.listen({ host: "0.0.0.0", port: cfg.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, async () => {
    stop();
    stopNotifier();
    await app.close();
    store.close();
    process.exit(0);
  });
}
