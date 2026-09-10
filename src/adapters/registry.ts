import type { Config } from "../util/config.js";
import { MALAYSIA_STATES, type State } from "../core/states.js";
import type { Adapter } from "./types.js";
import { DoeEqmsAdapter } from "./doeEqms.js";
import { OpenMeteoAdapter } from "./openMeteo.js";
import { UsgsEqAdapter } from "./usgsEq.js";
import { OniAdapter } from "./oni.js";
import { MetWarningsAdapter } from "./metWarnings.js";

/** Config may limit to specific states; empty means ALL 16 (full national coverage). */
function resolveStates(cfg: Config): State[] {
  const ids = cfg.EQMS_STATES.split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  return ids.length ? MALAYSIA_STATES.filter((s) => ids.includes(s.id)) : MALAYSIA_STATES;
}

/** Single place that composes the active data sources (DRY: index + cli + tests). */
export function buildAdapters(cfg: Config): Adapter[] {
  return [
    new DoeEqmsAdapter(resolveStates(cfg)),
    new OpenMeteoAdapter(),
    new UsgsEqAdapter(),
    new OniAdapter(),
    new MetWarningsAdapter(),
  ];
}
