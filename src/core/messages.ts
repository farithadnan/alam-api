/**
 * Every message the bot can send, in one file.
 *
 * Kept together so the copy can be reviewed as copy, without reading the notifier. The
 * rules from the brief are applied throughout: one main fact first, the place stated,
 * short, and always a link back to Alam.
 */

/** Where alerts link back to. Overridden by SITE_URL. */
const DEFAULT_URL = "https://ohmyalam.com";

const BAND_ICON: Record<string, string> = {
  Good: "🟢",
  Moderate: "🟠",
  Unhealthy: "🔴",
  "Very Unhealthy": "🔴",
  Hazardous: "🟣",
};

/** Malaysia time, short: "6:00 PM". */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-MY", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kuala_Lumpur",
  });
}

/** How long ago, at a glance: "12 min ago", "3h ago", "2d ago". */
export function ago(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const link = (url?: string) => (url || DEFAULT_URL).replace(/^https?:\/\//, "");

export interface WarningInput {
  title: string;
  place: string;
  issuedAt: string;
  validUntil?: string | null;
  url?: string;
}

/** A MET warning. */
export function warningMsg({ title, place, issuedAt, validUntil, url }: WarningInput): string {
  const lines = [`⚠️ ${title} — ${place}`, `Issued ${ago(issuedAt)}`];
  if (validUntil) lines.push(`Valid until ${clock(validUntil)}`);
  return `${lines.join("\n")}\n\nView details → ${link(url)}`;
}

export interface AqiInput {
  value: number;
  band: string;
  place: string;
  advice?: string;
  url?: string;
}

/** Air quality crossing into a worse band. */
export function aqiMsg({ value, band, place, advice, url }: AqiInput): string {
  const icon = BAND_ICON[band] ?? "🔴";
  const body = [`${icon} AQI ${Math.round(value)} · ${band}`, place];
  if (advice) body.push(advice);
  return `${body.join("\n")}\n\n${link(url)}`;
}

/** Air quality coming back down: cheap, and it stops people checking. */
export function aqiRecoveredMsg({ value, band, url }: AqiInput): string {
  const icon = BAND_ICON[band] ?? "🟢";
  return `${icon} AQI improved to ${Math.round(value)} · ${band}\nYour area is clear again.\n\n${link(url)}`;
}

export interface QuakeInput {
  magnitude: number;
  place: string;
  depthKm?: number | null;
  at: string;
  word?: string;
  url?: string;
}

/** A significant earthquake. */
export function quakeMsg({ magnitude, place, depthKm, at, word, url }: QuakeInput): string {
  const head = `🌐 M ${magnitude.toFixed(1)}${word ? ` · ${word}` : ""} — ${place}`;
  const detail = [depthKm != null ? `Depth ${Math.round(depthKm)} km` : "", ago(at)].filter(Boolean).join(" · ");
  return `${head}\n${detail}\n\n${link(url)}`;
}

/** Deep-link payload from /start, e.g. "loc_arau_perlis" -> Arau, Perlis. */
export function parsePayload(payload?: string | null): { town: string; state: string } | null {
  const m = /^loc_([a-z0-9-]+)_([a-z0-9-]+)$/i.exec((payload ?? "").trim());
  if (!m) return null;
  const title = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { town: title(m[1]), state: title(m[2]) };
}

export const commands = {
  welcome: (place?: string | null) =>
    [
      "👋 Alam alerts",
      place ? `Currently watching ${place}.` : "I will tell you when the air turns unhealthy or a warning is issued for your place.",
      "",
      "Set your place: /location",
      "Check: /status  ·  Stop: /stop  ·  Help: /help",
    ].join("\n"),

  locationPrompt: () => "📍 Where should I alert you?\nSend /location, or tap the button below.",

  locationSet: (place: string) => `✅ Location set to ${place}. I will alert you here.\n\n/status to review · /stop to turn off`,

  status: (place: string, alerts: string[]) =>
    [`📍 ${place}`, alerts.length ? `Alerts on: ${alerts.join(", ")}` : "No alerts on.", "", "/stop to turn off · /location to change place"].join("\n"),

  help: () =>
    [
      "Alam alerts sends one message when something changes: air quality crossing into an unhealthy band, a warning issued, or a significant quake near you.",
      "",
      "/location — set your place",
      "/status — your place and active alerts",
      "/stop — turn alerts off",
      "/help — this",
    ].join("\n"),

  stopped: () => "🔕 Alerts off. Send /start any time to turn them back on.",

  unknown: () => "I did not catch that. Try /location, /status, /stop or /help.",
};
