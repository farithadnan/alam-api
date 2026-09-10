import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from "node:sqlite";
import type { Observation } from "../core/types.js";

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
  readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        station TEXT NOT NULL,
        station_name TEXT NOT NULL DEFAULT '',
        measured_at TEXT NOT NULL,
        kind TEXT NOT NULL,
        value REAL NOT NULL,
        meta TEXT,
        ingested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(source, station, measured_at, kind)
      );
      CREATE INDEX IF NOT EXISTS idx_obs_latest  ON observations(source, station, measured_at DESC);
      CREATE INDEX IF NOT EXISTS idx_obs_prune   ON observations(measured_at);
    `);
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

  /** Latest reading per station for a source. */
  latestBySource(source: string): ObservationRow[] {
    return this.read(
      `SELECT source, station, station_name, measured_at, kind, value, meta
         FROM observations
         WHERE source = ? AND measured_at = (
           SELECT MAX(measured_at) FROM observations AS o2
           WHERE o2.source = observations.source AND o2.station = observations.station
         )
         ORDER BY station`,
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

  pruneOlderThan(days: number): number {
    const cutoff = new Date(Date.now() + 8 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 19);
    const res = this.db.prepare(`DELETE FROM observations WHERE measured_at < ?`).run(cutoff);
    return Number(res.changes ?? 0);
  }

  close(): void {
    this.db.close();
  }
}
