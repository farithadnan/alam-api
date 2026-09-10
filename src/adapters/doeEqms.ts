import { fetchJson } from "../util/http.js";
import type { Adapter } from "./types.js";
import type { Observation } from "../core/types.js";
import type { State } from "../core/states.js";

interface EqmsRow {
  STATION_ID: string;
  STATION_LOCATION: string;
  DATETIME: string;
  API: number;
  PARAM_SYMBOL?: string;
}
interface EqmsResponse {
  api_table_hourly: EqmsRow[];
}

/** Run `fn` over items with at most `limit` in flight at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

/**
 * Malaysia DOE APIMS (eqms.doe.gov.my) — authoritative per-station AQI.
 * Polls EVERY configured state; each state returns ~24h of hourly readings for
 * ALL of that state's stations, so one cycle refreshes national coverage.
 * A failing state is skipped (returns no rows) rather than aborting the poll.
 * Timestamps returned are Malaysia local time (UTC+08); kept as-is.
 */
export class DoeEqmsAdapter implements Adapter {
  readonly id = "doe-eqms" as const;

  constructor(private readonly states: State[]) {}

  async poll(): Promise<Observation[]> {
    const results = await mapLimit(this.states, 4, async (st) => {
      try {
        const localNow = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 19);
        const url =
          `https://eqms.doe.gov.my/api3/publicportalapims/apitablehourly` +
          `?stateid=${st.id}&datetime=${localNow}`;
        const data = await fetchJson<EqmsResponse>(url);
        return data.api_table_hourly.map((r) => ({
          source: "doe-eqms" as const,
          station: r.STATION_ID,
          stationName: r.STATION_LOCATION,
          measuredAt: r.DATETIME,
          kind: "aqi" as const,
          value: r.API,
          meta: { state: st.name, stateId: st.id, symbol: r.PARAM_SYMBOL ?? null },
        }));
      } catch {
        return [];
      }
    });
    return results.flat();
  }
}
