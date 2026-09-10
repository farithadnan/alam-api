import { fetchJson } from "../util/http.js";
import type { Adapter } from "./types.js";
import type { Observation } from "../core/types.js";

interface City {
  slug: string;
  name: string;
  lat: number;
  lon: number;
}

/** Small fixed list of Johor cities to poll from Open-Meteo. */
const JOHOR_CITIES: readonly City[] = [
  { slug: "johor-bahru", name: "Johor Bahru", lat: 1.49, lon: 103.74 },
  { slug: "batu-pahat", name: "Batu Pahat", lat: 1.8548, lon: 102.9325 },
  { slug: "muar", name: "Muar", lat: 2.0442, lon: 102.5691 },
];

interface CurrentData {
  temperature_2m: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  precipitation: number;
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
const WEATHER_PARAMS = "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation";
const AIR_QUALITY_PARAMS = "pm2_5,pm10,us_aqi,uv_index";
const FORECAST_PARAMS = "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,uv_index_max";

/**
 * Open-Meteo — free, key-less weather + air-quality + UV + 7-day daily forecast.
 * Emits per city: `weather` (current temp + humidity/wind/precip), `aqi`
 * (US scale + pollutants + UV), and one `forecast` per upcoming day.
 */
export class OpenMeteoAdapter implements Adapter {
  readonly id = "open-meteo" as const;

  async poll(): Promise<Observation[]> {
    const observations: Observation[] = [];
    for (const city of JOHOR_CITIES) {
      const [weather, air, forecast] = await Promise.all([
        this.fetchWeather(city),
        this.fetchAirQuality(city),
        this.fetchForecast(city),
      ]);
      observations.push(
        {
          source: "open-meteo",
          station: city.slug,
          stationName: city.name,
          measuredAt: weather.time,
          kind: "weather",
          value: weather.temperature_2m,
          meta: {
            humidity: weather.relative_humidity_2m,
            wind: weather.wind_speed_10m,
            precipitation: weather.precipitation,
          },
        },
        {
          source: "open-meteo",
          station: city.slug,
          stationName: city.name,
          measuredAt: air.time,
          kind: "aqi",
          value: air.us_aqi,
          meta: { pm2_5: air.pm2_5, pm10: air.pm10, uv: air.uv_index },
        },
      );
      for (let i = 0; i < forecast.time.length; i++) {
        observations.push({
          source: "open-meteo",
          station: city.slug,
          stationName: city.name,
          measuredAt: new Date(`${forecast.time[i]}T12:00:00Z`).toISOString(),
          kind: "forecast",
          value: forecast.temperature_2m_max[i] ?? 0,
          meta: {
            tmin: forecast.temperature_2m_min[i] ?? null,
            tmax: forecast.temperature_2m_max[i] ?? null,
            precip: forecast.precipitation_probability_max[i] ?? null,
            uv: forecast.uv_index_max[i] ?? null,
            code: forecast.weather_code[i] ?? null,
          },
        });
      }
    }
    return observations;
  }

  private async fetchWeather(city: City): Promise<CurrentData> {
    const url = `${WEATHER_URL}?latitude=${city.lat}&longitude=${city.lon}&current=${WEATHER_PARAMS}`;
    const data = await fetchJson<WeatherResponse>(url);
    return data.current;
  }

  private async fetchAirQuality(city: City): Promise<AirQualityCurrentData> {
    const url = `${AIR_QUALITY_URL}?latitude=${city.lat}&longitude=${city.lon}&current=${AIR_QUALITY_PARAMS}`;
    const data = await fetchJson<AirQualityResponse>(url);
    return data.current;
  }

  private async fetchForecast(city: City): Promise<Daily> {
    const url = `${WEATHER_URL}?latitude=${city.lat}&longitude=${city.lon}&daily=${FORECAST_PARAMS}&timezone=auto`;
    const data = await fetchJson<ForecastResponse>(url);
    return data.daily;
  }
}
