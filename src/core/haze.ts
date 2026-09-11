/**
 * Haze outlook from the Open-Meteo air-quality series.
 *
 * This is a model forecast of PM2.5 mass, not the official APIMS index, so it is
 * presented as concentrations (micrograms per cubic metre) and compared against the
 * WHO 24-hour guideline rather than labelled with the Malaysian AQI bands.
 */

/** WHO 24-hour mean guideline for PM2.5, in micrograms per cubic metre. */
export const WHO_PM25_24H = 15;

/** The hourly PM2.5 series the air-quality endpoint returns when it is asked for one. */
export interface Pm25Series {
  time?: string[];
  pm2_5?: Array<number | null>;
}

export interface HazeDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Highest hourly PM2.5 that day: the number people actually act on. */
  pm25Max: number;
  /** Mean hourly PM2.5 that day. */
  pm25Avg: number;
  hours: number;
}

/**
 * Collapse an hourly PM2.5 series into one row per local day.
 * Nulls are skipped; days with no usable reading are dropped.
 */
export function dailyPm25(series: Pm25Series): HazeDay[] {
  const times = series.time ?? [];
  const values = series.pm2_5 ?? [];
  const byDate = new Map<string, number[]>();
  for (let i = 0; i < times.length; i++) {
    const value = values[i];
    const date = (times[i] ?? "").slice(0, 10);
    if (!date || typeof value !== "number" || !Number.isFinite(value)) continue;
    const list = byDate.get(date);
    if (list) list.push(value);
    else byDate.set(date, [value]);
  }
  return [...byDate.entries()]
    .map(([date, list]) => ({
      date,
      pm25Max: Math.round(Math.max(...list) * 10) / 10,
      pm25Avg: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10,
      hours: list.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** True when a day's PM2.5 peak is above the WHO 24-hour guideline. */
export function aboveGuideline(pm25Max: number): boolean {
  return pm25Max > WHO_PM25_24H;
}
