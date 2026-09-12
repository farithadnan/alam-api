/**
 * Public InfoBanjir (JPS Malaysia) current flood + rainfall alerts.
 *
 * `currentalert.json` is a filtered watchlist: only stations currently in an alert
 * band (river at Alert/Warning/Danger, or Moderate/Heavy rain) appear. Two facts shape
 * the parser: an offline station keeps serving its last reading, so a *stale* alert is a
 * false alarm and must be dropped; and JPS flags broken stations with `Error`/blank
 * severities that must never be treated as alarms. Both are handled at retrieval.
 *
 * A record can carry a water-level facet AND a rainfall facet at once, so each alerting
 * facet becomes its own Observation with a distinct kind (flood / rainfall) — the store
 * keeps multiple kinds per (source, station, timestamp), so neither is lost.
 */

import { fetchJson } from "../util/http.js";
import { MY_OFFSET_MS } from "../core/constants.js";
import type { Adapter } from "./types.js";
import type { Observation } from "../core/types.js";

interface FloodAlertRecord {
  station_id?: string;
  station_name?: string;
  district?: string;
  state?: string;
  latitude?: string;
  longitude?: string;
  main_basin?: string;
  trend?: string;
  wl_severity_level?: string;
  level?: string;
  wl_date_time?: string;
  rf_severity_level?: string;
  rf1hour?: string;
  rf3hours?: string;
  rf24hours?: string;
  rf_date_time?: string;
}

const URL = "https://publicinfobanjir.water.gov.my/wp-content/themes/enlighten/data/currentalert.json";

/** Water-level bands that are real alarms (Normal / Error / blank are not). */
const RIVER_ALERT = new Set(["Alert", "Warning", "Danger"]);
/** Rain that is worth telling a user about (Light / None / blank are not). */
const RAIN_ALERT = new Set(["Moderate", "Heavy"]);
/**
 * A station never expires its reading upstream, but an alert based on an old reading is
 * a false alarm. Only emit while the reading itself is younger than this.
 */
const MAX_READING_AGE_MS = 4 * 3_600_000; // 4 h

const num = (s?: string | null): number | null => {
  const n = Number.parseFloat((s ?? "").trim());
  return Number.isFinite(n) ? n : null;
};

/** Parse Malaysia-local "DD/MM/YYYY HH:MM" (UTC+8, no DST) to a UTC epoch; null if malformed. */
export function parseMyDateTime(ts?: string | null): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/.exec((ts ?? "").trim());
  if (!m) return null;
  const [_, dd, mm, yy, hh, mi] = m as unknown as string[];
  return Date.UTC(Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi)) - MY_OFFSET_MS;
}

function baseObs(r: FloodAlertRecord, type: "river" | "rain"): Observation | null {
  const lat = num(r.latitude);
  const lon = num(r.longitude);
  if (!r.station_id) return null;
  return {
    source: "infobanjir",
    station: r.station_id,
    stationName: r.station_name ?? "",
    measuredAt: "", // set by the facet that carries the reading time
    kind: type === "river" ? "flood" : "rainfall",
    value: 0,
    meta: {
      type,
      state: r.state ?? null,
      district: r.district ?? null,
      basin: r.main_basin ?? null,
      trend: r.trend ?? null,
      lat: lat ?? null,
      lon: lon ?? null,
    },
  };
}

export class InfobanjirAdapter implements Adapter {
  readonly id = "infobanjir" as const;

  async poll(at = Date.now()): Promise<Observation[]> {
    // `?v=` busts the CDN cache so we read the live feed, not a stale copy.
    const records = await fetchJson<FloodAlertRecord[]>(`${URL}?v=${at}`, { retries: 2 });
    const out: Observation[] = [];
    for (const r of records ?? []) {
      out.push(...this.riverFacet(r, at), ...this.rainFacet(r, at));
    }
    return out;
  }

  private riverFacet(r: FloodAlertRecord, at: number): Observation[] {
    const sev = (r.wl_severity_level ?? "").trim();
    if (!RIVER_ALERT.has(sev)) return []; // Normal/Error/blank: no alarm
    const ms = parseMyDateTime(r.wl_date_time);
    if (ms == null || at - ms > MAX_READING_AGE_MS) return []; // unknown or stale: no false alarm
    const value = num(r.level); // water level in metres
    if (value == null || !r.station_id) return [];
    const o = baseObs(r, "river");
    if (!o) return [];
    return [{ ...o, measuredAt: new Date(ms).toISOString(), value, meta: { ...o.meta, severity: sev } }];
  }

  private rainFacet(r: FloodAlertRecord, at: number): Observation[] {
    const sev = (r.rf_severity_level ?? "").trim();
    if (!RAIN_ALERT.has(sev)) return []; // Light/None/blank: not worth an alarm
    const ms = parseMyDateTime(r.rf_date_time);
    if (ms == null || at - ms > MAX_READING_AGE_MS) return [];
    // Hourly intensity maps to JPS's own Light/Moderate/Heavy categories.
    const value = num(r.rf1hour);
    if (value == null || !r.station_id) return [];
    const o = baseObs(r, "rain");
    if (!o) return [];
    return [{ ...o, measuredAt: new Date(ms).toISOString(), value, meta: { ...o.meta, severity: sev, rf24hours: num(r.rf24hours), rf3hours: num(r.rf3hours) } }];
  }
}
