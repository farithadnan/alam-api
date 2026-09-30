import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
// type-only import of node:sqlite (erased at build/vite time)
import type { SQLInputValue, SQLOutputValue } from "node:sqlite";
import type { Observation } from "../core/types.js";
import { SQL, observationRow, stationRow, subscriptionRow, alertStateRow } from "./queries.js";

// node:sqlite is a builtin newer than the lists Vite/vite-node recognize, so loading
// it through createRequire bypasses Vite's ESM resolver and stays a native Node require.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

export interface ObservationRow {
  source: string;
  station: string;
  stationName: string;
  measuredAt: string;
  kind: string;
  value: number;
  meta?: Record<string, unknown> | null;
}

/** A chat's alert subscription — who to alert, for which place, on which alert types. */
export interface ChatSubscription {
  chatId: number;
  townSlug: string;
  state: string;
  place: string;
  alertTypes: string[];
  enabled: boolean;
}

/** One edge-trigger row: what a chat was last alerted on, per alert kind + key. */
export interface AlertStateRow {
  chatId: number;
  kind: string;
  key: string;
  lastBand: string | null;
  lastValue: number | null;
  lastAlertAt: string | null;
  lastRecoveryAt: string | null;
}

/** The alert families a subscription can opt into, in display order. */
export { DEFAULT_ALERT_TYPES } from "../bot/defaults.js";

/** An Observation as the positional values of one insert row. */
function toRow(o: Observation): SQLInputValue[] {
  return [o.source, o.station, o.stationName, o.measuredAt, o.kind, o.value, o.meta ? JSON.stringify(o.meta) : null];
}

export class Store {
  readonly db: InstanceType<typeof DatabaseSync>;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.applyMigrations();
  }

  /**
   * Versioned SQL migrations. Applies each `migrations/*.sql` in filename order once,
   * tracked in a `migrations` table, each step inside its own transaction. The SQL
   * lives in the repo-root `migrations/` dir, shared with the D1/Worker deployment.
   */
  private applyMigrations(): void {
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
    );
    const dir = fileURLToPath(new URL("../../migrations/", import.meta.url));
    const appliedRows = this.db.prepare(`SELECT id FROM migrations`).all() as { id: string }[];
    const applied = new Set(appliedRows.map((r) => r.id));
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      const id = f.replace(/\.sql$/, "");
      if (applied.has(id)) continue;
      const sql = readFileSync(join(dir, f), "utf8");
      this.db.exec("BEGIN");
      try {
        this.db.exec(sql);
        this.db.prepare(`INSERT INTO migrations (id) VALUES (?)`).run(id);
        this.db.exec("COMMIT");
        console.log(`[db] applied migration ${id}`);
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
  }

  /** Idempotent upsert keyed on (source, station, measured_at). Returns rows actually inserted. */
  ingest(rows: Observation[]): number {
    const stmt = this.db.prepare(`${SQL.insertObservationPrefix}(?, ?, ?, ?, ?, ?, ?)`);
    this.db.exec("BEGIN");
    try {
      let inserted = 0;
      for (const r of rows) {
        const res = stmt.run(...toRow(r));
        inserted += Number(res.changes ?? 0);
      }
      this.db.exec("COMMIT");
      return inserted;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  private read(sql: string, params: SQLInputValue[]): ObservationRow[] {
    const rows = this.db.prepare(sql).all(...params) as Record<string, SQLOutputValue>[];
    return rows.map((r) => observationRow(r));
  }

  /** Latest reading per (station, kind) for a source (observed only; forecast is separate). */
  latestBySource(source: string): ObservationRow[] {
    return this.read(SQL.latestBySource, [source]);
  }

  history(source: string, station: string, since: string): ObservationRow[] {
    return this.read(SQL.history, [source, station, since]);
  }

  stations(): { source: string; station: string; kind: string }[] {
    const rows = this.db.prepare(SQL.stations).all() as Record<string, SQLOutputValue>[];
    return rows.map((r) => stationRow(r));
  }

  /** Most recent observations of a kind (e.g. recent earthquakes). */
  latestByKind(kind: string, limit = 50): ObservationRow[] {
    return this.read(SQL.latestByKind, [kind, limit]);
  }

  /** Daily forecast rows for a source, grouped by station then day ascending. */
  forecast(source: string): ObservationRow[] {
    return this.read(SQL.forecast, [source]);
  }

  /** Hourly rows for a source (next ~24h), by time ascending. */
  hourly(source: string): ObservationRow[] {
    return this.read(SQL.hourly, [source]);
  }

  /** MET official district forecast (7 days per district), oldest date first. */
  metForecast(): ObservationRow[] {
    return this.read(SQL.metForecast, []);
  }

  /** Daily haze outlook rows (peak PM2.5) for one locality, soonest first. */
  hazeFor(station: string, limit = 7): ObservationRow[] {
    return this.read(SQL.hazeFor, [station, limit]);
  }

  pruneOlderThan(days: number): number {
    const cutoff = new Date(Date.now() + 8 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 19);
    const res = this.db.prepare(SQL.pruneOlderThan).run(cutoff);
    return Number(res.changes ?? 0);
  }

  /** Per-adapter poll bookkeeping, so the scheduler can skip fresh sources. */
  sourceState(adapterId: string): { lastPollledAt: string | null; lastOkAt: string | null } {
    const row = this.db.prepare(SQL.sourceState).get(adapterId) as { last_polled_at: string; last_ok_at: string | null } | undefined;
    return { lastPollledAt: row?.last_polled_at ?? null, lastOkAt: row?.last_ok_at ?? null };
  }

  /** True when the source has no recorded poll, or its last poll is older than the interval. */
  isStale(adapterId: string, intervalMs: number, now = Date.now()): boolean {
    const { lastPollledAt } = this.sourceState(adapterId);
    if (!lastPollledAt) return true;
    const at = Date.parse(lastPollledAt);
    return !Number.isFinite(at) || now - at >= intervalMs;
  }

  /**
   * Record a poll attempt (success or failure).
   *
   * Stored as canonical UTC (with Z), unlike the observation timestamps which are
   * Malaysia local time for display. Freshness is machine timing compared against
   * the epoch, so shifting it would make the result depend on the host timezone.
   */
  recordPoll(adapterId: string, rows: number, error?: string): void {
    const at = new Date().toISOString();
    this.db.prepare(SQL.recordPoll).run(adapterId, at, error ? null : at, error ?? null, rows);
  }

  /** Asserted MET district for a town slug (reference data; see migration 003). */
  townDistrict(townSlug: string): string | null {
    const row = this.db.prepare(SQL.townDistrict).get(townSlug) as { district_name: string } | undefined;
    return row?.district_name ?? null;
  }

  /** Every subscription, optionally only the enabled, alerted-on chats. */
  getSubscriptions(enabledOnly = true): ChatSubscription[] {
    const rows = this.db.prepare(SQL.subscriptions(enabledOnly)).all() as Record<string, SQLOutputValue>[];
    return rows.map((r) => subscriptionRow(r));
  }

  getSubscription(chatId: number): ChatSubscription | null {
    const r = this.db.prepare(SQL.subscription).get(chatId) as Record<string, SQLOutputValue> | undefined;
    return r ? subscriptionRow(r) : null;
  }

  /** Create or fully refresh a chat's subscription. /start re-opts in with defaults. */
  upsertSubscription(s: Omit<ChatSubscription, "enabled"> & { enabled: boolean }): void {
    this.db.prepare(SQL.upsertSubscription).run(s.chatId, s.townSlug, s.state, s.place, s.alertTypes.join(","), s.enabled ? 1 : 0);
  }

  setChatEnabled(chatId: number, enabled: boolean): void {
    this.db.prepare(SQL.setChatEnabled).run(enabled ? 1 : 0, chatId);
  }

  setChatAlertTypes(chatId: number, alertTypes: string[], enabled = true): void {
    this.db.prepare(SQL.setChatAlertTypes).run(alertTypes.join(","), enabled ? 1 : 0, chatId);
  }

  /** All edge-trigger state for one chat (preload for one evaluation pass). */
  alertStateForChat(chatId: number): AlertStateRow[] {
    const rows = this.db.prepare(SQL.alertStateForChat).all(chatId) as Record<string, SQLOutputValue>[];
    return rows.map((r) => alertStateRow(r));
  }

  getAlertState(chatId: number, kind: string, key: string): AlertStateRow | null {
    const r = this.db.prepare(SQL.alertState).get(chatId, kind, key) as Record<string, SQLOutputValue> | undefined;
    return r ? alertStateRow(r) : null;
  }

  setAlertState(row: AlertStateRow): void {
    this.db
      .prepare(SQL.setAlertState)
      .run(row.chatId, row.kind, row.key, row.lastBand, row.lastValue, row.lastAlertAt, row.lastRecoveryAt);
  }

  close(): void {
    this.db.close();
  }
}
