import { fetchJson } from "../util/http.js";
import type { Adapter } from "./types.js";
import type { Observation } from "../core/types.js";

interface GeoFeature {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    url: string;
    // Richer USGS fields (all free in the same GeoJSON response):
    alert?: string | null; // green|yellow|orange|red — PAGER impact alert
    tsunami?: number | null; // 0/1
    felt?: number | null; // number of "felt" reports
    mmi?: number | null; // maximum modified Mercalli intensity
    cdi?: number | null; // maximum reported intensity
    sig?: number | null; // significance score
    magType?: string | null;
    nst?: number | null; // number of seismic stations used
    status?: string | null; // reviewed|automatic
    type?: string | null; // earthquake|quarry blast|...
    title?: string | null;
  };
  geometry: { type: string; coordinates: number[] };
}
interface GeoJsonResponse {
  features: GeoFeature[];
}

const BASE_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query";
const SE_ASIA_BBOX = "minlatitude=-10&maxlatitude=20&minlongitude=90&maxlongitude=140";
const MAX_OBSERVATIONS = 200;
/** Max characters for the human-readable place label. */
const PLACE_LIMIT = 80;

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * USGS FDSN earthquake feed (earthquake.usgs.gov) — free, key-less.
 * Polls the last 7 days for SE-Asia (4.5+), emitting one `quake` Observation
 * per event, capped to the most recent set to keep payloads sane. A wider
 * window keeps the hazards view populated during quiet days while staying
 * idempotent (each event has a stable USGS event id).
 *
 * We keep the full USGS property set (PAGER alert, tsunami flag, felt reports,
 * MMI/CDI intensity, significance, magType, station count, review status) so the
 * UI can show what the raw feed actually carries instead of just magnitude.
 */
export class UsgsEqAdapter implements Adapter {
  readonly id = "usgs-eq" as const;

  async poll(): Promise<Observation[]> {
    const start = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
    const url =
      `${BASE_URL}?format=geojson&starttime=${start}` +
      `&${SE_ASIA_BBOX}&minmagnitude=4.5&orderby=time`;

    const data = await fetchJson<GeoJsonResponse>(url);
    return data.features.slice(-MAX_OBSERVATIONS).map((f) => {
      const p = f.properties;
      return {
        source: "usgs-eq" as const,
        station: f.id,
        stationName: truncate(p.place ?? "Unknown", PLACE_LIMIT),
        measuredAt: new Date(p.time).toISOString(),
        kind: "quake" as const,
        value: p.mag ?? 0,
        meta: {
          depth: f.geometry.coordinates[2],
          url: p.url,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          alert: p.alert ?? null,
          tsunami: p.tsunami ?? null,
          felt: p.felt ?? null,
          mmi: p.mmi ?? null,
          cdi: p.cdi ?? null,
          sig: p.sig ?? null,
          magType: p.magType ?? null,
          nst: p.nst ?? null,
          status: p.status ?? null,
          eqType: p.type ?? null,
        },
      };
    });
  }
}
