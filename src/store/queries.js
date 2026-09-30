/**
 * Store SQL + row mappers — the single source of truth shared by both runtimes.
 *
 * `store/db.ts` runs these on node:sqlite (synchronous) and `store/d1-store.js` on
 * Cloudflare D1 (asynchronous). Keeping the statements and the snake_case→camelCase
 * mapping here means a schema change is edited once, and the two stores can never
 * drift apart. Each store only owns how it *executes* (sync/async, bind style).
 */

/** The observation column list every read selects, in contract order. */
const OBS = "source, station, station_name, measured_at, kind, value, meta";

export const SQL = {
  latestBySource: `SELECT ${OBS}
     FROM observations o
     WHERE o.source = ? AND o.kind NOT IN ('forecast','hourly') AND o.measured_at = (
       SELECT MAX(o2.measured_at) FROM observations o2
       WHERE o2.source = o.source AND o2.station = o.station AND o2.kind = o.kind
         AND o2.kind NOT IN ('forecast','hourly')
     )
     ORDER BY o.station, o.kind`,

  history: `SELECT ${OBS}
     FROM observations WHERE source = ? AND station = ? AND measured_at >= ?
     ORDER BY measured_at`,

  stations: `SELECT DISTINCT source, station, kind FROM observations`,

  latestByKind: `SELECT ${OBS}
     FROM observations WHERE kind = ? ORDER BY measured_at DESC, id DESC LIMIT ?`,

  forecast: `SELECT ${OBS}
     FROM observations WHERE source = ? AND kind = 'forecast' ORDER BY station, measured_at`,

  hourly: `SELECT ${OBS}
     FROM observations WHERE source = ? AND kind = 'hourly' ORDER BY station, measured_at`,

  metForecast: `SELECT ${OBS}
     FROM observations WHERE kind = 'metfc' ORDER BY station, measured_at`,

  hazeFor: `SELECT ${OBS}
     FROM observations WHERE kind = 'haze' AND station = ? ORDER BY measured_at LIMIT ?`,

  townDistrict: `SELECT district_name FROM town_districts WHERE town_slug = ?`,

  sourceState: `SELECT last_polled_at, last_ok_at FROM source_state WHERE adapter_id = ?`,

  recordPoll: `INSERT INTO source_state (adapter_id, last_polled_at, last_ok_at, last_error, last_rows)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(adapter_id) DO UPDATE SET
       last_polled_at = excluded.last_polled_at,
       last_ok_at = CASE WHEN excluded.last_error IS NULL THEN excluded.last_ok_at ELSE source_state.last_ok_at END,
       last_error = excluded.last_error,
       last_rows = excluded.last_rows`,

  pruneOlderThan: `DELETE FROM observations WHERE measured_at < ?`,

  /** Prefix shared by the single-row (node) and multi-row (D1) inserts. */
  insertObservationPrefix:
    `INSERT OR IGNORE INTO observations (source, station, station_name, measured_at, kind, value, meta) VALUES `,

  /** enabledOnly toggles the WHERE clause; parameter-free. */
  subscriptions: (enabledOnly) =>
    `SELECT chat_id, town_slug, state, place, alert_types, enabled FROM chat_subscriptions${enabledOnly ? " WHERE enabled = 1" : ""} ORDER BY chat_id`,

  subscription: `SELECT chat_id, town_slug, state, place, alert_types, enabled FROM chat_subscriptions WHERE chat_id = ?`,

  upsertSubscription: `INSERT INTO chat_subscriptions (chat_id, town_slug, state, place, alert_types, enabled)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET
       town_slug = excluded.town_slug, state = excluded.state, place = excluded.place,
       alert_types = excluded.alert_types, enabled = excluded.enabled,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,

  setChatEnabled: `UPDATE chat_subscriptions SET enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE chat_id = ?`,

  setChatAlertTypes: `UPDATE chat_subscriptions SET alert_types = ?, enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE chat_id = ?`,

  alertStateForChat: `SELECT chat_id, kind, key, last_band, last_value, last_alert_at, last_recovery_at
     FROM alert_state WHERE chat_id = ? ORDER BY kind, key`,

  alertState: `SELECT chat_id, kind, key, last_band, last_value, last_alert_at, last_recovery_at
     FROM alert_state WHERE chat_id = ? AND kind = ? AND key = ?`,

  setAlertState: `INSERT INTO alert_state (chat_id, kind, key, last_band, last_value, last_alert_at, last_recovery_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, kind, key) DO UPDATE SET
       last_band = excluded.last_band, last_value = excluded.last_value,
       last_alert_at = excluded.last_alert_at, last_recovery_at = excluded.last_recovery_at`,

  pushSubs: `SELECT endpoint, p256dh, auth, town, state FROM push_subs`,

  upsertPushSub: `INSERT INTO push_subs (endpoint, p256dh, auth, town, state)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh = excluded.p256dh, auth = excluded.auth,
       town = excluded.town, state = excluded.state,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,

  deletePushSub: `DELETE FROM push_subs WHERE endpoint = ?`,
};

const str = (v) => (v == null ? "" : String(v));

/** One observations row → the camelCase contract every consumer uses. */
export function observationRow(r) {
  return {
    source: str(r.source),
    station: str(r.station),
    stationName: str(r.station_name),
    measuredAt: str(r.measured_at),
    kind: str(r.kind),
    value: Number(r.value),
    meta: r.meta == null ? undefined : JSON.parse(String(r.meta)),
  };
}

export function stationRow(r) {
  return { source: str(r.source), station: str(r.station), kind: str(r.kind) };
}

export function subscriptionRow(r) {
  return {
    chatId: Number(r.chat_id),
    townSlug: str(r.town_slug),
    state: str(r.state),
    place: str(r.place),
    alertTypes: str(r.alert_types).split(",").filter(Boolean),
    enabled: Number(r.enabled) === 1,
  };
}

export function alertStateRow(r) {
  return {
    chatId: Number(r.chat_id),
    kind: str(r.kind),
    key: str(r.key),
    lastBand: r.last_band == null ? null : String(r.last_band),
    lastValue: r.last_value == null ? null : Number(r.last_value),
    lastAlertAt: r.last_alert_at == null ? null : String(r.last_alert_at),
    lastRecoveryAt: r.last_recovery_at == null ? null : String(r.last_recovery_at),
  };
}

export function pushSubRow(r) {
  return { endpoint: str(r.endpoint), p256dh: str(r.p256dh), auth: str(r.auth), town: str(r.town), state: str(r.state) };
}