/**
 * Every message the bot can send, in one file.
 *
 * Kept together so the copy can be reviewed as copy, without reading the notifier.
 * Messages are Telegram HTML: a bold heading, then a blank line, then a short body,
 * and commands as bullet points with the command in bold. Every dynamic value is
 * escaped, and the sender falls back to plain text if anything still trips the
 * parser, so an alert is never lost to a formatting edge case.
 */

/** Where alerts link back to. Overridden by SITE_URL. */
const DEFAULT_URL = "https://app.oh-alam.my";

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

/** HTML-escape a dynamic value so parse_mode=HTML can't break on user/upstream text. */
const esc = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const b = (s: string) => `<b>${s}</b>`;

const displayUrl = (u: string) => u.replace(/^https?:\/\//, "");

/**
 * A clickable link back to the site. Display text is the host without the scheme,
 * so it reads clean while Telegram treats the whole anchor as tappable.
 */
const link = (url?: string): string => {
  const u = (url || DEFAULT_URL).replace(/\/+$/, "");
  return `<a href="${esc(u)}">${esc(displayUrl(u))}</a>`;
};

/** The single site link shown once at the end of an alert notification. */
export const siteLink = (url?: string): string => link(url);

/** One bullet-point command row: a bold command followed by a plain description. */
const bullet = (name: string, desc: string) => `• ${b(name)}  ${desc}`;

const commandsBlock = (rows: [string, string][]): string => `${b("Commands")}\n${rows.map(([n, d]) => bullet(n, d)).join("\n")}`;

export interface WarningInput {
  title: string;
  place: string;
  issuedAt: string;
  validUntil?: string | null;
}

/** A MET warning. */
export function warningMsg({ title, place, issuedAt, validUntil }: WarningInput): string {
  const lines = [b(`⚠️ ${esc(title)} — ${esc(place)}`), `Issued ${ago(issuedAt)}`];
  if (validUntil) lines.push(`Valid until ${esc(clock(validUntil))}`);
  return lines.join("\n");
}

export interface AqiInput {
  value: number;
  band: string;
  place: string;
  advice?: string;
}

/** Air quality crossing into a worse band. */
export function aqiMsg({ value, band, place, advice }: AqiInput): string {
  const icon = BAND_ICON[band] ?? "🔴";
  const body = [b(`${icon} AQI ${Math.round(value)} · ${esc(band)}`), esc(place)];
  if (advice) body.push(esc(advice));
  return body.join("\n");
}

/** Air quality coming back down: cheap, and it stops people checking. */
export function aqiRecoveredMsg({ value, band }: AqiInput): string {
  const icon = BAND_ICON[band] ?? "🟢";
  return `${b(`${icon} AQI improved to ${Math.round(value)} · ${esc(band)}`)}\nYour area is clear again.`;
}

export interface QuakeInput {
  magnitude: number;
  place: string;
  depthKm?: number | null;
  at: string;
  word?: string;
}

/** A significant earthquake. */
export function quakeMsg({ magnitude, place, depthKm, at, word }: QuakeInput): string {
  const head = `🌐 M ${magnitude.toFixed(1)}${word ? ` · ${esc(word)}` : ""} — ${esc(place)}`;
  const detail = [depthKm != null ? `Depth ${Math.round(depthKm)} km` : "", ago(at)].filter(Boolean).join(" · ");
  return `${b(head)}\n${detail}`;
}

export interface FloodInput {
  place: string;
  station: string;
  district?: string | null;
  level: number;
  severity: string;
  trend?: string | null;
}

/** A river has crossed into a flood alert band (Danger / Warning / Alert). */
export function floodMsg({ place, station, district, level, severity, trend }: FloodInput): string {
  const lines = [b("🚨 River flood alert"), `${esc(station)} — ${esc(district ?? place)}`];
  lines.push(`Level ${esc(String(level))} m · ${esc(severity)}${trend ? ` · ${esc(trend)}` : ""}`);
  return lines.join("\n");
}

export interface RainInput {
  place: string;
  station: string;
  district?: string | null;
  mmHour: number;
  severity: string;
}

/** Heavy rainfall in your area. */
export function rainMsg({ place, station, district, mmHour, severity }: RainInput): string {
  const lines = [b("🌧 Heavy rain"), `${esc(station)} — ${esc(district ?? place)}`];
  lines.push(`${esc(String(mmHour))} mm/hr · ${esc(severity)}`);
  return lines.join("\n");
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
      b("👋 Hi, I'm Alam"),
      "",
      place
        ? `I'll keep an eye on ${esc(place)} and send you a heads-up when the air turns unhealthy, a warning is issued, there's a notable quake, or a river near you reaches alert level.`
        : "Tell me where you are and I'll keep an eye on the weather, air quality and hazards there, nudging you only when something is worth knowing.",
      "",
      commandsBlock([
        [place ? "/status" : "/location", "your place"],
        ["/alerts", "choose alert types"],
        ["/help", "more"],
        ["/stop", "pause alerts"],
      ]),
    ].join("\n"),

  locationPrompt: () => `${b("📍 Where should I keep watch?")}\n\nSend /location followed by your town and state, e.g. /location arau perlis`,

  locationUnknown: (input: string) => `I don't recognise "${esc(input)}".\n\nTry a town and state, e.g. /location arau perlis`,

  locationSet: (place: string) =>
    [
      b(`✅ Watching ${esc(place)}`),
      "",
      "I'll keep an eye on it and only message you when there's something worth knowing.",
      "",
      commandsBlock([
        ["/status", "review your alerts"],
        ["/stop", "pause alerts"],
      ]),
    ].join("\n"),

  status: (place: string, alerts: string[], condition?: string | null) =>
    [
      b(`📍 ${esc(place)}`),
      condition ? esc(condition) : null,
      alerts.length ? `I'm watching: ${alerts.map(esc).join(", ")}.` : "No alerts switched on yet.",
      "",
      commandsBlock([
        ["/alerts", "choose alert types"],
        ["/location", "change place"],
        ["/stop", "pause alerts"],
      ]),
    ]
      .filter((l): l is string => l !== null)
      .join("\n"),

  alertsShow: (alerts: string[]) =>
    [
      alerts.length ? b(`I'm watching: ${alerts.map(esc).join(", ")}.`) : b("All alerts paused"),
      "",
      "Choose what I keep an eye on for you: air quality, weather warnings, earthquakes, or rivers and heavy rain.",
      "",
      commandsBlock([
        ["/alerts aqi flood", "just air + river/rain"],
        ["/alerts +quake -warnings", "toggle one"],
        ["/alerts all", "everything"],
      ]),
    ].join("\n"),

  help: () =>
    [
      b("Alam · Malaysia weather & safety alerts"),
      "",
      "I watch your place and message you only when something changes worth knowing: air quality dropping into the unhealthy range, a warning issued, a significant quake, or a river near you at alert level.",
      "",
      commandsBlock([
        ["/location", "set your place"],
        ["/alerts", "choose alert types"],
        ["/status", "your place + alerts"],
        ["/stop", "pause alerts"],
        ["/help", "this again"],
      ]),
      "",
      `Live dashboard: ${link()}`,
    ].join("\n"),

  stopped: () => `${b("🔕 Paused")}\n\nI'll stay quiet. Send /start any time to turn things back on.`,

  unknown: () => "I didn't catch that.\n\nTry /location, /status, /alerts, /stop or /help.",

  /** Dev-only: prove the pipe end to end with a sample alert for the chat's place. */
  debug: (place: string) => `🧪 test alert: this is what an AQI alert looks like for ${esc(place)}. No action needed.`,
};
