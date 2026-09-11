import { fetchJson } from "../util/http.js";
import { slug } from "../util/text.js";
import { districtState, isDistrict } from "../core/metDistricts.js";
import type { Adapter } from "./types.js";
import type { Observation } from "../core/types.js";

interface MetForecastRow {
  location?: { location_id?: string; location_name?: string };
  date?: string;
  morning_forecast?: string | null;
  afternoon_forecast?: string | null;
  night_forecast?: string | null;
  summary_forecast?: string | null;
  summary_when?: string | null;
  min_temp?: number | null;
  max_temp?: number | null;
}

/** Malaysia's official open weather API — 7-day district forecast, MET Malaysia. */
const FORECAST_URL = "https://api.data.gov.my/weather/forecast?limit=5000";

/** One row per district per day — MET publishes 170 district locations. */
const MAX_ROWS = 3200;


/**
 * MET Malaysia's official 7-day outlook, per district, bilingual source text.
 * This is the *official* forecast (as opposed to the model data in open-meteo),
 * so the app can show what MET actually says for a district. Rows carry no state
 * field, so the state comes from MET's own district registry (location_id), and
 * non-district rows (towns, state rows, waters) are dropped rather than guessed.
 */
export class MetForecastAdapter implements Adapter {
  readonly id = "my-met-forecast" as const;

  async poll(): Promise<Observation[]> {
    const rows = await fetchJson<MetForecastRow[]>(FORECAST_URL);
    const out: Observation[] = [];
    for (const r of rows.slice(0, MAX_ROWS)) {
      const name = r.location?.location_name;
      const id = r.location?.location_id;
      const date = r.date;
      if (!name || !date || !isDistrict(id)) continue; // districts only — never guess
      out.push({
        source: "my-met-forecast" as const,
        station: slug(name),
        stationName: name,
        measuredAt: `${date}T00:00:00`,
        kind: "metfc" as const,
        value: r.max_temp ?? 0,
        meta: {
          state: districtState(id),
          districtId: id ?? null,
          morning: r.morning_forecast ?? null,
          afternoon: r.afternoon_forecast ?? null,
          night: r.night_forecast ?? null,
          summary: r.summary_forecast ?? null,
          when: r.summary_when ?? null,
          tmin: r.min_temp ?? null,
          tmax: r.max_temp ?? null,
        },
      });
    }
    return out;
  }
}
