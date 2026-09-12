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
  return { town: title(m[1] ?? ""), state: title(m[2] ?? "") };
}

export const commands = {
  welcome: (place?: string | null) =>
    [
      "👋 Alam alerts",
      place
        ? `Watching ${place}. I will message you when the air turns unhealthy or a warning is issued.`
        : "I will message you when the air turns unhealthy or a warning is issued for your place.",
      "",
      "/location  set your place",
      "/stop      pause alerts",
      "/help      more",
    ].join("\n"),

  locationPrompt: () => "📍 Where should I alert you?\nSend /location followed by your town and state, e.g. /location arau perlis",

  locationUnknown: (input: string) => `I don't know "${input}". Try a town and state, e.g. /location arau perlis`,

  locationSet: (place: string) =>
    `✅ Location set to ${place}.\n\n/status  review your alerts\n/stop    pause alerts`,

  status: (place: string, alerts: string[], condition?: string | null) =>
    [
      `📍 ${place}`,
      condition ?? null,
      alerts.length ? `Alerts on: ${alerts.join(", ")}` : "No alerts on.",
      "",
      "/location  change place",
      "/stop      pause alerts",
    ]
      .filter((l): l is string => l !== null && l !== "")
      .join("\n"),

  help: () =>
    [
      "Alam alerts sends one message when something changes: air quality crossing into an unhealthy band, a warning issued, or a significant quake near you.",
      "",
      "/location  set your place",
      "/status    your place and your alerts",
      "/stop      pause alerts",
      "/help      more",
    ].join("\n"),

  stopped: () => "🔕 Alerts off. Send /start any time to turn them back on.",

  unknown: () => "I did not catch that. Try /location, /status, /stop or /help.",

  /** Dev-only: prove the pipe end to end with a sample alert for the chat's place. */
  debug: (place: string) => `🧪 test alert — this is what an AQI alert looks like for ${place}. No action needed.`,
};
