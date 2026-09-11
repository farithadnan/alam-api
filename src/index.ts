import fs from "node:fs";
import { loadConfig } from "./util/config.js";
import { Store } from "./store/db.js";
import { buildAdapters } from "./adapters/registry.js";
import { buildServer } from "./http/server.js";
import { startScheduler } from "./scheduler.js";

const cfg = loadConfig();
const store = new Store(cfg.DB_PATH);
const adapters = buildAdapters(cfg);

const app = buildServer(store);
const cadence = (id: string) =>
  (
    {
      "doe-eqms": cfg.POLL_SECONDS * 1000,
      "open-meteo": cfg.POLL_OPENMETEO_SECONDS * 1000,
      "usgs-eq": cfg.POLL_USGS_SECONDS * 1000,
      oni: cfg.POLL_ONI_SECONDS * 1000,
      "my-met": cfg.POLL_MET_SECONDS * 1000,
      "my-met-forecast": cfg.POLL_METFC_SECONDS * 1000,
      news: cfg.POLL_NEWS_SECONDS * 1000,
    } as Record<string, number>
  )[id] ?? cfg.POLL_SECONDS * 1000;
const stop = startScheduler(store, adapters, cadence, (m) => app.log.info(m));

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
