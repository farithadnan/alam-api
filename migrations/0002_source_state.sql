-- 002: per-adapter poll bookkeeping.
-- The scheduler uses this to skip upstreams whose data is still fresh, so a
-- restart (or a tsx watch reload) no longer re-polls every free API. Without it,
-- each boot re-fetched everything: the 900 KB MET feed, 108-town Open-Meteo calls
-- and 16 DOE state calls, which is also what triggered upstream rate limiting.
CREATE TABLE IF NOT EXISTS source_state (
  adapter_id     TEXT PRIMARY KEY,
  last_polled_at TEXT NOT NULL,
  last_ok_at     TEXT,
  last_error     TEXT,
  last_rows      INTEGER
);
