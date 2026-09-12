import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  /** Telegram bot token for alerts. Optional: the API runs fine without it. */
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  /** Where alerts link back to. */
  SITE_URL: z.string().default("https://ohmyalam.com"),
  DB_PATH: z.string().default("data/udara.db"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug"]).default("info"),
  /** Comma-separated DOE state ids to poll; empty = all 16 states. */
  EQMS_STATES: z.string().default(""),
  POLL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Weather/Forecast changes slower than AQI — a lighter cadence keeps nationwide calls sane. */
  POLL_OPENMETEO_SECONDS: z.coerce.number().int().positive().default(1800),
  POLL_USGS_SECONDS: z.coerce.number().int().positive().default(600),
  POLL_ONI_SECONDS: z.coerce.number().int().positive().default(86400),
  POLL_MET_SECONDS: z.coerce.number().int().positive().default(900),
  POLL_NEWS_SECONDS: z.coerce.number().int().positive().default(1800),
  /** newsdata.io key (optional). Without it the news feed falls back to free Malaysian RSS. */
  NEWSDATA_API_KEY: z.string().optional(),
  /** MET's official district forecast changes once a day. */
  POLL_METFC_SECONDS: z.coerce.number().int().positive().default(21600),
  /** Telegram alerts are silent overnight (Malaysia local time). Inclusive start, exclusive end. */
  ALERT_QUIET_START: z.coerce.number().int().min(0).max(23).default(23),
  ALERT_QUIET_END: z.coerce.number().int().min(0).max(23).default(7),
  /** Absolute path to a built frontend (dashboard) to serve at `/`. Empty = API only. */
  DASHBOARD_DIST: z.string().default(""),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Load a local .env (Node's built-in loader) so secrets stay out of the shell
  // history and out of git. Absent file is fine.
  try {
    process.loadEnvFile?.();
  } catch {
    /* no .env present */
  }
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid config:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}

/** Per-adapter poll interval in ms. One definition, used by the server and the CLI. */
export const cadenceFor = (cfg: ReturnType<typeof loadConfig>) => (id: string): number =>
  ({
    "doe-eqms": cfg.POLL_SECONDS * 1000,
    "open-meteo": cfg.POLL_OPENMETEO_SECONDS * 1000,
    "usgs-eq": cfg.POLL_USGS_SECONDS * 1000,
    oni: cfg.POLL_ONI_SECONDS * 1000,
    "my-met": cfg.POLL_MET_SECONDS * 1000,
    "my-met-forecast": cfg.POLL_METFC_SECONDS * 1000,
    news: cfg.POLL_NEWS_SECONDS * 1000,
    // Flood alerts refresh on the shared AQI cadence (5 min); the freshness gate
    // inside the adapter already protects against stale readings between polls.
    infobanjir: cfg.POLL_SECONDS * 1000,
  })[id] ?? cfg.POLL_SECONDS * 1000;
