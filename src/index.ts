import fs from "node:fs";
import path from "node:path";

import { loadConfig } from "./util/config.js";
import { Store } from "./store/db.js";
import { DoeEqmsAdapter } from "./adapters/doeEqms.js";
import { OpenMeteoAdapter } from "./adapters/openMeteo.js";
import { buildServer } from "./http/server.js";
import { startScheduler } from "./scheduler.js";

const cfg = loadConfig();
const store = new Store(cfg.DB_PATH);
const adapters = [new DoeEqmsAdapter(cfg.EQMS_STATE_ID), new OpenMeteoAdapter()];

const app = buildServer(store);
const stop = startScheduler(store, adapters, () => cfg.POLL_SECONDS * 1000, (m) => app.log.info(m));

try {
  await app.listen({ host: "0.0.0.0", port: cfg.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, async () => {
    stop();
    await app.close();
    store.close();
    process.exit(0);
  });
}

// Remember dbPath as data dir for the dashboard; emit for convenience
export default { dbPath: cfg.DB_PATH };
