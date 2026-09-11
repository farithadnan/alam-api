import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
// type-only import of node:sqlite (erased at build/vite time)
import type { SQLInputValue, SQLOutputValue } from "node:sqlite";
import type { Observation } from "../core/types.js";

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
   * tracked in a `migrations` table, each step inside its own transaction.
   */
  private applyMigrations(): void {
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
    );
    const dir = fileURLToPath(new URL("./migrations/", import.meta.url));
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
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO observations (source, station, station_name, measured_at, kind, value, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const tx = this.db.exec("BEGIN");
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

  /** SQL returns snake_case columns; map to the camelCase contract consumers use. */
  private mapRow(r: Record<string, SQLOutputValue>): ObservationRow {
    return {
      source: String(r.source),
      station: String(r.station),
      stationName: String(r.station_name ?? ""),
      measuredAt: String(r.measured_at),
      kind: String(r.kind),
      value: Number(r.value),
      meta: r.meta == null ? undefined : JSON.parse(String(r.meta)) as Record<string, unknown>,
    };
  }

  private read(sql: string, params: SQLInputValue[]): ObservationRow[] {
    const rows = this.db.prepare(sql).all(...params) as Record<string, SQLOutputValue>[];
    return rows.map((r) => this.mapRow(r));
  }

  /** Latest reading per (station, kind) for a source (observed only; forecast is separate). */
  latestBySource(source: string): ObservationRow[] {
    return this.read(
      `SELECT o.source, o.station, o.station_name, o.measured_at, o.kind, o.value, o.meta
         FROM observations o
         WHERE o.source = ? AND o.kind NOT IN ('forecast','hourly') AND o.measured_at = (
           SELECT MAX(o2.measured_at) FROM observations o2
           WHERE o2.source = o.source
             AND o2.station = o.station
             AND o2.kind = o.kind
             AND o2.kind NOT IN ('forecast','hourly')
         )
         ORDER BY o.station, o.kind`,
      [source],
    );
  }

  history(source: string, station: string, since: string): ObservationRow[] {
    return this.read(
      `SELECT source, station, station_name, measured_at, kind, value, meta
         FROM observations WHERE source = ? AND station = ? AND measured_at >= ?
         ORDER BY measured_at`,
      [source, station, since],
    );
  }

  stations(): { source: string; station: string; kind: string }[] {
    const rows = this.db
      .prepare(`SELECT DISTINCT source, station, kind FROM observations`)
      .all() as Record<string, SQLOutputValue>[];
    return rows.map((r) => ({
      source: String(r.source),
      station: String(r.station),
      kind: String(r.kind),
    }));
  }

  /** Most recent observations of a kind (e.g. recent earthquakes). */
  latestByKind(kind: string, limit = 50): ObservationRow[] {
    const rows = this.db
      .prepare(
        `SELECT source, station, station_name, measured_at, kind, value, meta
           FROM observations WHERE kind = ? ORDER BY measured_at DESC, id DESC LIMIT ?`,
      )
      .all(kind, limit) as Record<string, SQLOutputValue>[];
    return rows.map((r) => this.mapRow(r));
  }

  /** Daily forecast rows for a source, grouped by station then day ascending. */
  forecast(source: string): ObservationRow[] {
    return this.read(
      `SELECT source, station, station_name, measured_at, kind, value, meta
         FROM observations WHERE source = ? AND kind = 'forecast'
         ORDER BY station, measured_at`,
      [source],
    );
  }

  /** Hourly rows for a source (next ~24h), by time ascending. */
  hourly(source: string): ObservationRow[] {
    return this.read(
      `SELECT source, station, station_name, measured_at, kind, value, meta
         FROM observations WHERE source = ? AND kind = 'hourly'
         ORDER BY station, measured_at`,
      [source],
    );
  }

  /** MET official district forecast (7 days per district), oldest date first. */
  metForecast(): ObservationRow[] {
    return this.read(
      `SELECT source, station, station_name, measured_at, kind, value, meta
         FROM observations WHERE kind = 'metfc'
         ORDER BY station, measured_at`,
      [],
    );
  }

  pruneOlderThan(days: number): number {
    const cutoff = new Date(Date.now() + 8 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 19);
    const res = this.db.prepare(`DELETE FROM observations WHERE measured_at < ?`).run(cutoff);
    return Number(res.changes ?? 0);
  }

  /** Per-adapter poll bookkeeping, so the scheduler can skip fresh sources. */
  sourceState(adapterId: string): { lastPollledAt: string | null; lastOkAt: string | null } {
    const row = this.db
      .prepare(`SELECT last_polled_at, last_ok_at FROM source_state WHERE adapter_id = ?`)
      .get(adapterId) as { last_polled_at: string; last_ok_at: string | null } | undefined;
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
    this.db
      .prepare(
        `INSERT INTO source_state (adapter_id, last_polled_at, last_ok_at, last_error, last_rows)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(adapter_id) DO UPDATE SET
           last_polled_at = excluded.last_polled_at,
           last_ok_at = CASE WHEN excluded.last_error IS NULL THEN excluded.last_ok_at ELSE source_state.last_ok_at END,
           last_error = excluded.last_error,
           last_rows = excluded.last_rows`,
      )
      .run(adapterId, at, error ? null : at, error ?? null, rows);
  }

  /** Asserted MET district for a town slug (reference data; see migration 003). */
  townDistrict(townSlug: string): string | null {
    const row = this.db
      .prepare(`SELECT district_name FROM town_districts WHERE town_slug = ?`)
      .get(townSlug) as { district_name: string } | undefined;
    return row?.district_name ?? null;
  }

  close(): void {
    this.db.close();
  }
}
