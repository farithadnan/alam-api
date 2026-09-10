-- 001: initial observations table
-- Snapshot store: one denormalized row per (source, station, measured_at, kind).
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
CREATE INDEX IF NOT EXISTS idx_obs_latest ON observations(source, station, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_prune  ON observations(measured_at);
