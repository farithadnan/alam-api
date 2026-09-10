export type SourceId = "doe-eqms" | "open-meteo" | "usgs-eq" | "oni" | "my-met";

export type Kind = "aqi" | "weather" | "quake" | "climate" | "forecast" | "warning";

/** Normalized record every adapter produces — the single contract (DRY/OCP). */
export interface Observation {
  source: SourceId;
  /** Stable key, e.g. station id (`CA29J`) or `lat|lon`. */
  station: string;
  /** Human label, e.g. `Segamat, JOHOR`. */
  stationName: string;
  /** ISO 8601. Note: DOE eqms timestamps are Malaysia local (UTC+08). */
  measuredAt: string;
  kind: Kind;
  /** Primary scalar: API index, temp °C, magnitude, ONI index. */
  value: number;
  meta?: Record<string, unknown>;
}
