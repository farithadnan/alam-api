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

/** Per-station metadata from the same public APIMS map service (exact position + context). */
interface StationMeta {
  lat?: number | null;
  lon?: number | null;
  place?: string | null;
  category?: string | null;
  region?: string | null;
  pm10?: number | null;
  param?: string | null;
}
interface ArcGisResponse {
  features?: { attributes: Record<string, unknown> }[];
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

const STATIONS_URL =
  "https://eqms.doe.gov.my/api3/publicmapproxy/PUBLIC_DISPLAY/CAQM_MCAQM_Current_Reading/MapServer/0/query" +
  "?where=1%3D1&outFields=*&returnGeometry=false&f=json";

/**
 * Malaysia DOE APIMS (eqms.doe.gov.my) — authoritative per-station AQI.
 * Polls EVERY configured state; each state returns ~24h of hourly readings for
 * ALL of that state's stations, so one cycle refreshes national coverage.
 * A failing state is skipped (returns no rows) rather than aborting the poll.
 * Timestamps returned are Malaysia local time (UTC+08); kept as-is.
 *
 * A single national call to the public map service adds per-station context the
 * hourly table lacks: exact coordinates, station category (Urban/Industry/Rural/
 * Background…), the facility name, region and PM10 — all free, all public.
 */
export class DoeEqmsAdapter implements Adapter {
  readonly id = "doe-eqms" as const;

  constructor(private readonly states: State[]) {}

  /** station id -> metadata. Best-effort: a failure just means less context. */
  private async stationMeta(): Promise<Map<string, StationMeta>> {
    const out = new Map<string, StationMeta>();
    try {
      const data = await fetchJson<ArcGisResponse>(STATIONS_URL);
      for (const f of data.features ?? []) {
        const a = f.attributes;
        const id = a.STATION_ID as string | undefined;
        if (!id) continue;
        out.set(id, {
          lat: (a.LATITUDE as number) ?? null,
          lon: (a.LONGITUDE as number) ?? null,
          place: (a.PLACE as string) ?? null,
          category: ((a.STATION_CATEGORY as string) ?? "").trim() || null,
          region: (a.REGION_NAME as string) ?? null,
          pm10: (a.API_PM10 as number) ?? null,
          param: (a.PARAM_SELECTED as string) ?? null,
        });
      }
    } catch {
      /* metadata is optional */
    }
    return out;
  }

  async poll(at?: string): Promise<Observation[]> {
    const meta = await this.stationMeta();
    const results = await mapLimit(this.states, 4, async (st) => {
      try {
        const localNow = at ?? new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 19);
        const url =
          `https://eqms.doe.gov.my/api3/publicportalapims/apitablehourly` +
          `?stateid=${st.id}&datetime=${localNow}`;
        const data = await fetchJson<EqmsResponse>(url);
        return data.api_table_hourly.map((r) => {
          const m = meta.get(r.STATION_ID);
          return {
            source: "doe-eqms" as const,
            station: r.STATION_ID,
            stationName: r.STATION_LOCATION,
            measuredAt: r.DATETIME,
            kind: "aqi" as const,
            value: r.API,
            meta: {
              state: st.name,
              stateId: st.id,
              symbol: r.PARAM_SYMBOL ?? null,
              lat: m?.lat ?? null,
              lon: m?.lon ?? null,
              place: m?.place ?? null,
              category: m?.category ?? null,
              region: m?.region ?? null,
              pm10: m?.pm10 ?? null,
              param: m?.param ?? null,
            },
          };
        });
      } catch {
        return [];
      }
    });
    return results.flat();
  }
}
