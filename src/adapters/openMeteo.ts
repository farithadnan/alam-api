import { fetchJson } from "../util/http.js";
import type { Adapter } from "./types.js";
import type { Observation } from "../core/types.js";
import { MALAYSIA_LOCALITIES, type Locality } from "../core/localities.js";

interface CurrentData {
  temperature_2m: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  precipitation: number;
  apparent_temperature: number;
  weather_code: number;
  time: string;
}
interface WeatherResponse { current: CurrentData }

interface AirQualityCurrentData {
  pm2_5: number;
  pm10: number;
  us_aqi: number;
  uv_index: number;
  time: string;
}
interface AirQualityResponse { current: AirQualityCurrentData }

interface Daily {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_probability_max: (number | null)[];
  weather_code: (number | null)[];
  uv_index_max: (number | null)[];
}
interface ForecastResponse { daily: Daily }

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const WEATHER_PARAMS = "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,apparent_temperature,weather_code";
const AIR_QUALITY_PARAMS = "pm2_5,pm10,us_aqi,uv_index";
const FORECAST_PARAMS = "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,uv_index_max";

/**
 * Open-Meteo — free, key-less weather + air-quality + UV + 7-day forecast for
 * EVERY state's localities (national registry), each tagged meta.state so the
 * dashboard can group by state. Polled on a slower cadence than AQI (30-60m).
 */
export class OpenMeteoAdapter implements Adapter {
  readonly id = "open-meteo" as const;

  constructor(private readonly localities: Locality[] = MALAYSIA_LOCALITIES) {}

  async poll(): Promise<Observation[]> {
    const out: Observation[] = [];
    for (const loc of this.localities) {
      try {
        const [weather, air, forecast] = await Promise.all([
          this.fetch<WeatherResponse>(WEATHER_URL, loc, `current=${WEATHER_PARAMS}`).then((d) => d.current),
          this.fetch<AirQualityResponse>(AIR_QUALITY_URL, loc, `current=${AIR_QUALITY_PARAMS}`).then((d) => d.current),
          this.fetch<ForecastResponse>(WEATHER_URL, loc, `daily=${FORECAST_PARAMS}&timezone=auto`).then((d) => d.daily),
        ]);
        out.push(
        {
          source: "open-meteo",
          station: loc.slug,
          stationName: loc.name,
          measuredAt: weather.time,
          kind: "weather",
          value: weather.temperature_2m,
          meta: { state: loc.state, humidity: weather.relative_humidity_2m, wind: weather.wind_speed_10m, precipitation: weather.precipitation, apparentTemp: weather.apparent_temperature, code: weather.weather_code },
        },
        {
          source: "open-meteo",
          station: loc.slug,
          stationName: loc.name,
          measuredAt: air.time,
          kind: "aqi",
          value: air.us_aqi,
          meta: { state: loc.state, pm2_5: air.pm2_5, pm10: air.pm10, uv: air.uv_index },
        },
      );
      for (let i = 0; i < forecast.time.length; i++) {
        out.push({
          source: "open-meteo",
          station: loc.slug,
          stationName: loc.name,
          measuredAt: new Date(`${forecast.time[i]}T12:00:00Z`).toISOString(),
          kind: "forecast",
          value: forecast.temperature_2m_max[i] ?? 0,
          meta: {
            state: loc.state,
            tmin: forecast.temperature_2m_min[i] ?? null,
            tmax: forecast.temperature_2m_max[i] ?? null,
            precip: forecast.precipitation_probability_max[i] ?? null,
            uv: forecast.uv_index_max[i] ?? null,
            code: forecast.weather_code[i] ?? null,
          },
        });
        }
      } catch {
        // skip a locality that failed to fetch; keep the rest of the country
      }
    }
    return out;
  }

  private async fetch<T>(base: string, loc: Locality, params: string): Promise<T> {
    const url = `${base}?latitude=${loc.lat}&longitude=${loc.lon}&${params}`;
    return fetchJson<T>(url);
  }
}
