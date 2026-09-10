import type { Config } from "../util/config.js";
import type { Adapter } from "./types.js";
import { DoeEqmsAdapter } from "./doeEqms.js";
import { OpenMeteoAdapter } from "./openMeteo.js";

/** Single place that composes the active data sources (DRY: index + cli + tests). */
export function buildAdapters(cfg: Config): Adapter[] {
  return [new DoeEqmsAdapter(cfg.EQMS_STATE_ID), new OpenMeteoAdapter()];
}
