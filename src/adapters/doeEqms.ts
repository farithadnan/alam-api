import { fetchJson } from "../util/http.js";
import type { Adapter } from "./types.js";
import type { Observation } from "../core/types.js";

interface EqmsRow {
  STATION_ID: string;
  STATE_ID: number;
  STATION_NAME: string | null;
  STATION_LOCATION: string;
  DATETIME: string;
  API: number;
  PARAM_SYMBOL?: string;
}
interface EqmsResponse {
  api_table_hourly: EqmsRow[];
}

/**
 * Malaysia DOE APIMS (eqms.doe.gov.my) — authoritative per-station AQI.
 * A single poll returns ~24h of hourly readings for every station in a state,
 * so it both refreshes current values and backfills recent history.
 * Timestamps returned are Malaysia local time (UTC+08); kept as-is.
 */
export class DoeEqmsAdapter implements Adapter {
  readonly id = "doe-eqms" as const;

  constructor(private readonly stateId: number) {}

  async poll(): Promise<Observation[]> {
    // query for "now" in Malaysia local time (eqms expects local, not UTC)
    const localNow = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 19);
    const url =
      `https://eqms.doe.gov.my/api3/publicportalapims/apitablehourly` +
      `?stateid=${this.stateId}&datetime=${localNow}`;

    const data = await fetchJson<EqmsResponse>(url);
    return data.api_table_hourly.map((r) => ({
      source: "doe-eqms" as const,
      station: r.STATION_ID,
      stationName: r.STATION_LOCATION,
      measuredAt: r.DATETIME,
      kind: "aqi" as const,
      value: r.API,
      meta: { symbol: r.PARAM_SYMBOL ?? null },
    }));
  }
}
