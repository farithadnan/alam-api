import { fetchText } from "../util/http.js";
import type { Adapter } from "./types.js";
import type { Observation } from "../core/types.js";

const ONI_URL = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt";

/** Line:  JJA 2026  29.09   1.80  (season, year, SST, ONI anomaly) */
const LINE_RE = /^\s*([A-Z]{3})\s+(\d{4})\s+[\d.+-]+\s+([\d.+-]+)\s*$/;

/** Middle month of each 3-month season (for a stable measuredAt). */
const SEASON_MID: Record<string, string> = {
  JFM: "02", FMA: "03", MAM: "04", AMJ: "05", MJJ: "06",
  JJA: "07", JAS: "08", ASO: "09", SON: "10", OND: "11", NDJ: "01", DJF: "02",
};

export type EnsoPhase = "El Niño" | "La Niña" | "Neutral";

export function ensoPhase(anomaly: number): EnsoPhase {
  if (anomaly >= 0.5) return "El Niño";
  if (anomaly <= -0.5) return "La Niña";
  return "Neutral";
}

interface OniRow {
  season: string;
  year: string;
  anomaly: number;
}

/** The latest season is the last data row in the plain-text index file. */
function parse(text: string): OniRow | null {
  let last: OniRow | null = null;
  for (const line of text.split("\n")) {
    const m = LINE_RE.exec(line);
    if (m) last = { season: m[1]!, year: m[2]!, anomaly: Number(m[3]) };
  }
  return last;
}

/**
 * El Niño / La Niña phase from the NOAA CPC ONI (3-month running mean of
 * Niño-3.4 SST anomaly). NOAA has no JSON API for it, so we parse the plain
 * text index file — the latest season is the last data row. Low frequency
 * (monthly), so a single `climate` observation carries the current phase.
 */
export class OniAdapter implements Adapter {
  readonly id = "oni" as const;

  async poll(): Promise<Observation[]> {
    const text = await fetchText(ONI_URL, { headers: { accept: "text/plain" } });
    const row = parse(text);
    if (!row) throw new Error("No ONI data row parsed from NOAA feed");
    const month = SEASON_MID[row.season] ?? "07";
    const phase = ensoPhase(row.anomaly);
    return [
      {
        source: "oni",
        station: "nino3.4",
        stationName: "El Niño Southern Oscillation (Niño 3.4)",
        measuredAt: `${row.year}-${month}-15T00:00:00Z`,
        kind: "climate",
        value: row.anomaly,
        meta: { phase, season: row.season, year: row.year },
      },
    ];
  }
}
