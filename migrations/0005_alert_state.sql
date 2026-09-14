-- Edge-trigger bookkeeping for the alert state machine: the band/key a chat was last
-- alerted on, so a steady multi-day haze sends one message and a return to clean air
-- sends exactly one recovery notice (never a stream).
CREATE TABLE IF NOT EXISTS alert_state (
  chat_id          INTEGER NOT NULL,
  kind             TEXT NOT NULL,        -- aqi | warning | quake
  key              TEXT NOT NULL,        -- station id / warning slug / quake event id
  last_band        TEXT,                 -- aqi band label only ("" for other kinds)
  last_value       REAL,                 -- last AQI value or magnitude
  last_alert_at    TEXT,                 -- when we last alerted this key
  last_recovery_at TEXT,                 -- when we last sent a recovery for this key
  PRIMARY KEY (chat_id, kind, key)
);
