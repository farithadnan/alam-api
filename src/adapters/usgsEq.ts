import { fetchJson } from "../util/http.js";
import type { Adapter } from "./types.js";
import type { Observation } from "../core/types.js";

interface GeoFeature {
  id: string;
  properties: {
    mag: number | null;
    place: string | null;
    time: number;
    depth: number;
    url: string;
  };
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
 * Polls the last 24h for SE-Asia (4.5+), emitting one `quake` Observation
 * per event, capped to the most recent set to keep payloads sane.
 */
export class UsgsEqAdapter implements Adapter {
  readonly id = "usgs-eq" as const;

  async poll(): Promise<Observation[]> {
    const start = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const url =
      `${BASE_URL}?format=geojson&starttime=${start}` +
      `&${SE_ASIA_BBOX}&minmagnitude=4.5&orderby=time`;

    const data = await fetchJson<GeoJsonResponse>(url);
    return data.features.slice(-MAX_OBSERVATIONS).map((f) => ({
      source: "usgs-eq" as const,
      station: f.id,
      stationName: truncate(f.properties.place ?? "Unknown", PLACE_LIMIT),
      measuredAt: new Date(f.properties.time).toISOString(),
      kind: "quake" as const,
      value: f.properties.mag ?? 0,
      meta: { depth: f.properties.depth, url: f.properties.url },
    }));
  }
}
