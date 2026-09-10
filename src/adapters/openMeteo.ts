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
interface WeatherResponse {
  current: CurrentData;
}

interface AirQualityCurrentData {
  pm2_5: number;
  pm10: number;
  us_aqi: number;
  uv_index: number;
  time: string;
}
interface AirQualityResponse {
  current: AirQualityCurrentData;
}

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const WEATHER_PARAMS = "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation";
const AIR_QUALITY_PARAMS = "pm2_5,pm10,us_aqi,uv_index";

/**
 * Open-Meteo — free, key-less weather + air-quality + UV forecasts.
 * Polls a short fixed list of Johor cities, emitting one `weather` and one
 * `aqi` Observation per city using the API's own `current.time` as measuredAt.
 */
export class OpenMeteoAdapter implements Adapter {
  readonly id = "open-meteo" as const;

  async poll(): Promise<Observation[]> {
    const observations: Observation[] = [];
    for (const city of JOHOR_CITIES) {
      const weather = await this.fetchWeather(city);
      const air = await this.fetchAirQuality(city);
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
    }
    return observations;
  }

  private async fetchWeather(city: City): Promise<CurrentData> {
    const url =
      `${WEATHER_URL}?latitude=${city.lat}&longitude=${city.lon}` +
      `&current=${WEATHER_PARAMS}`;
    const data = await fetchJson<WeatherResponse>(url);
    return data.current;
  }

  private async fetchAirQuality(city: City): Promise<AirQualityCurrentData> {
    const url =
      `${AIR_QUALITY_URL}?latitude=${city.lat}&longitude=${city.lon}` +
      `&current=${AIR_QUALITY_PARAMS}`;
    const data = await fetchJson<AirQualityResponse>(url);
    return data.current;
  }
}
