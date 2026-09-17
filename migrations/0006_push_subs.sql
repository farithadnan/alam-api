-- Web-push subscriptions (browser Push API): one row per installed device.
-- endpoint is unique per PushSubscription; keys are the P256DH/Auth used to
-- encrypt sends. town/state is what the user opted in to be alerted about.
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  town       TEXT NOT NULL DEFAULT '',
  state      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_push_subs_state ON push_subs(state);
