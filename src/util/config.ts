import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DB_PATH: z.string().default("data/udara.db"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug"]).default("info"),
  /** Comma-separated DOE state ids to poll; empty = all 16 states. */
  EQMS_STATES: z.string().default(""),
  POLL_SECONDS: z.coerce.number().int().positive().default(300),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid config:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
