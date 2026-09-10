import { describe, expect, it, vi, afterEach } from "vitest";
import { OpenMeteoAdapter } from "./openMeteo.js";

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

function stubWeather() {
  return vi.fn(async (url: string) => {
    const body = url.includes("air-quality") ? airQualityResponse : weatherResponse;
    return { ok: true, json: async () => body };
  });
}

describe("OpenMeteoAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes weather and aqi Observations for each city", async () => {
    const fetch = stubWeather();
    vi.stubGlobal("fetch", fetch);

    const adapter = new OpenMeteoAdapter();
    const observations = await adapter.poll();

    expect(fetch).toHaveBeenCalledTimes(6);

    const weather = observations.filter((o) => o.kind === "weather");
    const aqi = observations.filter((o) => o.kind === "aqi");

    expect(weather).toHaveLength(3);
    expect(aqi).toHaveLength(3);
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
    expect(weather[1]?.station).toBe("batu-pahat");
    expect(weather[2]?.station).toBe("muar");
  });
});
