import { describe, expect, it, vi, afterEach } from "vitest";
import { OpenMeteoAdapter } from "../../src/adapters/openMeteo.js";

const weatherResponse = {
  current: {
    temperature_2m: 30.2,
    relative_humidity_2m: 78,
    wind_speed_10m: 5.4,
    precipitation: 0.0,
    time: "2026-09-11T06:00",
  },
};

const airQualityResponse = {
  current: {
    pm2_5: 15.3,
    pm10: 28.7,
    us_aqi: 62,
    uv_index: 3,
    time: "2026-09-11T06:00",
  },
};

const forecastResponse = {
  daily: {
    time: ["2026-09-11", "2026-09-12"],
    temperature_2m_max: [31, 32],
    temperature_2m_min: [24, 25],
    precipitation_probability_max: [20, null],
    weather_code: [1, 3],
    uv_index_max: [10, 8],
  },
};

function stubOpenMeteo() {
  return vi.fn(async (url: string) => {
    const body = url.includes("air-quality")
      ? airQualityResponse
      : url.includes("daily=")
      ? forecastResponse
      : weatherResponse;
    return { ok: true, json: async () => body };
  });
}

describe("OpenMeteoAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes weather, aqi and forecast Observations for each city", async () => {
    const fetch = stubOpenMeteo();
    vi.stubGlobal("fetch", fetch);

    const observations = await new OpenMeteoAdapter().poll();

    expect(fetch).toHaveBeenCalledTimes(9); // weather + aqi + forecast per city x 3

    const weather = observations.filter((o) => o.kind === "weather");
    const aqi = observations.filter((o) => o.kind === "aqi");
    const forecast = observations.filter((o) => o.kind === "forecast");

    expect(weather).toHaveLength(3);
    expect(aqi).toHaveLength(3);
    expect(forecast).toHaveLength(6); // 3 cities x 2 days

    expect(weather[0]).toEqual({
      source: "open-meteo",
      station: "johor-bahru",
      stationName: "Johor Bahru",
      measuredAt: weatherResponse.current.time,
      kind: "weather",
      value: weatherResponse.current.temperature_2m,
      meta: {
        humidity: weatherResponse.current.relative_humidity_2m,
        wind: weatherResponse.current.wind_speed_10m,
        precipitation: weatherResponse.current.precipitation,
      },
    });
    expect(aqi[0]).toEqual({
      source: "open-meteo",
      station: "johor-bahru",
      stationName: "Johor Bahru",
      measuredAt: airQualityResponse.current.time,
      kind: "aqi",
      value: airQualityResponse.current.us_aqi,
      meta: {
        pm2_5: airQualityResponse.current.pm2_5,
        pm10: airQualityResponse.current.pm10,
        uv: airQualityResponse.current.uv_index,
      },
    });
    expect(forecast[0]).toMatchObject({
      source: "open-meteo",
      station: "johor-bahru",
      kind: "forecast",
      value: 31,
      meta: { tmin: 24, tmax: 31, precip: 20, uv: 10, code: 1 },
    });
    expect(weather[1]?.station).toBe("batu-pahat");
    expect(weather[2]?.station).toBe("muar");
  });
});
