import { describe, expect, it, vi, afterEach } from "vitest";
import { UsgsEqAdapter } from "../../src/adapters/usgsEq.js";

const geojson = {
  type: "FeatureCollection",
  features: [
    {
      id: "us7000aaaa",
      properties: {
        mag: 5.2,
        place: "Talaud Islands, Indonesia",
        time: 1726000000000,
        depth: 12.4,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000aaaa",
      },
      geometry: { type: "Point", coordinates: [126.5, 3.2] },
    },
    {
      id: "us7000bbbb",
      properties: {
        mag: 4.7,
        place:
          "A very long place name that should definitely be truncated down to something much shorter for a sane station label, in a coastal region of Southeast Asia near a subduction zone",
        time: 1725990000000,
        depth: 30.0,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000bbbb",
      },
      geometry: { type: "Point", coordinates: [120.5, -0.9] },
    },
  ],
};

describe("UsgsEqAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes quake Observations from GeoJSON features", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => geojson }));
    vi.stubGlobal("fetch", fetch);

    const adapter = new UsgsEqAdapter();
    const observations = await adapter.poll();

    expect(fetch).toHaveBeenCalledTimes(1);

    expect(observations).toHaveLength(2);
    expect(observations[0]).toEqual({
      source: "usgs-eq",
      station: "us7000aaaa",
      stationName: "Talaud Islands, Indonesia",
      measuredAt: new Date(1726000000000).toISOString(),
      kind: "quake",
      value: 5.2,
      meta: {
        depth: 12.4,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000aaaa",
        lat: 3.2,
        lon: 126.5,
      },
    });

    expect(observations[1]?.kind).toBe("quake");
    expect(observations[1]?.value).toBe(4.7);
    expect(observations[1]?.station).toBe("us7000bbbb");
    expect(observations[1]?.stationName.length).toBeLessThanOrEqual(80);
  });
});
