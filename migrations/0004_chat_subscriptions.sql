-- Per-chat alert subscriptions: who to alert, for which place, on which alert types.
CREATE TABLE IF NOT EXISTS chat_subscriptions (
  chat_id     INTEGER PRIMARY KEY,
  town_slug   TEXT NOT NULL,                            -- locality slug (gives coords + district)
  state       TEXT NOT NULL,                            -- canonical state name, matches observation meta.state
  place       TEXT NOT NULL,                            -- human label, e.g. "Arau, Perlis"
  alert_types TEXT NOT NULL DEFAULT 'aqi,warning,quake',-- comma-separated enabled alert families
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_subscriptions_enabled ON chat_subscriptions(enabled);
