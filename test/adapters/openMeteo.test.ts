import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenMeteoAdapter } from "../../src/adapters/openMeteo.js";

const weatherResponse = {
  current: {
    temperature_2m: 30.2,
    relative_humidity_2m: 78,
    wind_speed_10m: 5.4,
    wind_gusts_10m: 7.1,
    precipitation: 0.0,
    apparent_temperature: 33.5,
    weather_code: 1,
    pressure_msl: 1009.4,
    visibility: 10040,
    dew_point_2m: 24.7,
    time: "2026-09-11T06:00",
  },
  daily: { sunrise: ["2026-09-11T06:57"], sunset: ["2026-09-11T19:04"] },
};
const airQualityResponse = {
  current: { pm2_5: 15.3, pm10: 28.7, us_aqi: 62, uv_index: 3, time: "2026-09-11T06:00" },
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
  return vi.fn(async (url) => {
    const body = url.includes("air-quality")
      ? airQualityResponse
      : url.includes("current=")
        ? weatherResponse
        : forecastResponse;
    return { ok: true, json: async () => body };
  });
}

const ONE_LOCALITY = [{ slug: "johor-bahru", name: "Johor Bahru", state: "Johor", lat: 1.49, lon: 103.74 }];

describe("OpenMeteoAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes weather, aqi and forecast for a locality, tagged with its state", async () => {
    vi.stubGlobal("fetch", stubOpenMeteo());
    const observations = await new OpenMeteoAdapter(ONE_LOCALITY).poll();

    expect(observations).toHaveLength(1 + 1 + 2); // weather + aqi + 2 forecast days
    const [w, a, f1, f2] = observations;
    expect(w).toMatchObject({ source: "open-meteo", station: "johor-bahru", kind: "weather", value: 30.2, meta: { state: "Johor", humidity: 78, wind: 5.4, precipitation: 0 } });
    expect(a).toMatchObject({ kind: "aqi", value: 62, meta: { state: "Johor", pm2_5: 15.3, uv: 3 } });
    expect(f1).toMatchObject({ kind: "forecast", value: 31, meta: { state: "Johor", tmin: 24, tmax: 31, precip: 20, code: 1 } });
    expect(f2?.kind).toBe("forecast");
  });
});
