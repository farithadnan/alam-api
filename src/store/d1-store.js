/**
 * D1Store — the Store contract over Cloudflare D1, for Pages Functions.
 *
 * Drop-in read-path replacement for the `Store(key: node:sqlite)` used by the VPS
 * Fastify server, so handlers that call `store.latestBySource(...)` etc. keep working
 * once their calls are `await`ed (D1 is async; node:sqlite was sync).
 *
 * D1 API differences handled here, in one place:
 *   - bind via `.bind(...)` (positional), not `.prepare(...).all(...args)`
 *   - `.all()` returns `{ success, results, meta }` (not a bare array)
 *   - `.first()` returns one row or `null`
 *   - columns come back snake_case and must be mapped to the camelCase contract.
 */
export class D1Store {
  /** @param {import("@cloudflare/workers-types").D1Database} db */
  constructor(db) {
    this.db = db;
  }

  /** Map a snake_case D1 row to the camelCase ObservationRow every consumer uses. */
  mapRow(r) {
    return {
      source: String(r.source ?? ""),
      station: String(r.station ?? ""),
      stationName: String(r.station_name ?? ""),
      measuredAt: String(r.measured_at ?? ""),
      kind: String(r.kind ?? ""),
      value: Number(r.value),
      meta: r.meta == null ? undefined : JSON.parse(String(r.meta)),
    };
  }

  async select(sql, ...params) {
    const prepared = this.db.prepare(sql);
    const res = params.length ? prepared.bind(...params).all() : prepared.all();
    return (await res).results.map((r) => this.mapRow(r));
  }

  /** Latest reading per (station, kind) for a source (observed only; no forecast/hourly). */
  async latestBySource(source) {
    return this.select(
      `SELECT source, station, station_name, measured_at, kind, value, meta
         FROM observations o
         WHERE o.source = ? AND o.kind NOT IN ('forecast','hourly') AND o.measured_at = (
           SELECT MAX(o2.measured_at) FROM observations o2
           WHERE o2.source = o.source AND o2.station = o.station AND o2.kind = o.kind
             AND o2.kind NOT IN ('forecast','hourly')
         )
         ORDER BY o.station, o.kind`,
      source,
    );
  }

  async history(source, station, since) {
    return this.select(
      `SELECT source, station, station_name, measured_at, kind, value, meta
         FROM observations WHERE source = ? AND station = ? AND measured_at >= ?
         ORDER BY measured_at`,
      source, station, since,
    );
  }

  async stations() {
    const res = await this.db.prepare(`SELECT DISTINCT source, station, kind FROM observations`).all();
    return res.results.map((r) => ({
      source: String(r.source),
      station: String(r.station),
      kind: String(r.kind),
    }));
  }

  async latestByKind(kind, limit = 50) {
    const res = await this.db
      .prepare(`SELECT source, station, station_name, measured_at, kind, value, meta
                  FROM observations WHERE kind = ? ORDER BY measured_at DESC, id DESC LIMIT ?`)
      .bind(kind, limit)
      .all();
    return res.results.map((r) => this.mapRow(r));
  }

  async forecast(source) {
    return this.select(
      `SELECT source, station, station_name, measured_at, kind, value, meta
         FROM observations WHERE source = ? AND kind = 'forecast' ORDER BY station, measured_at`,
      source,
    );
  }

  async hourly(source) {
    return this.select(
      `SELECT source, station, station_name, measured_at, kind, value, meta
         FROM observations WHERE source = ? AND kind = 'hourly' ORDER BY station, measured_at`,
      source,
    );
  }

  async metForecast() {
    return this.select(
      `SELECT source, station, station_name, measured_at, kind, value, meta
         FROM observations WHERE kind = 'metfc' ORDER BY station, measured_at`,
    );
  }

  async hazeFor(station, limit = 7) {
    return this.select(
      `SELECT source, station, station_name, measured_at, kind, value, meta
         FROM observations WHERE kind = 'haze' AND station = ? ORDER BY measured_at LIMIT ?`,
      station, limit,
    );
  }

  async townDistrict(townSlug) {
    const row = await this.db
      .prepare(`SELECT district_name FROM town_districts WHERE town_slug = ?`)
      .bind(townSlug)
      .first();
    return row?.district_name ?? null;
  }

  /**
   * Idempotent append-only insert (`UNIQUE(source, station, measured_at, kind)` + IGNORE).
   * Batches rows into a few multi-row statements so a whole adapter cycle stays within a
   * free-tier Worker's CPU budget. If a batch trips a storage bound-variable limit, it is
   * recursively halved until it fits — robust to whatever the D1/SQLite limit is on a host
   * (local miniflare had a tighter limit than the docs assume). Returns rows actually inserted.
   */
  async ingest(rows) {
    if (!rows.length) return 0;
    return this._ingestChunk(rows);
  }

  async _ingestChunk(chunk) {
    const BASE = `INSERT OR IGNORE INTO observations (source, station, station_name, measured_at, kind, value, meta) VALUES `;
    const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?)`).join(", ");
    const vals = chunk.flatMap((r) => [
      r.source, r.station, r.stationName, r.measuredAt, r.kind, r.value,
      r.meta ? JSON.stringify(r.meta) : null,
    ]);
    try {
      const res = await this.db.prepare(BASE + placeholders).bind(...vals).run();
      return Number(res.meta.changes ?? 0);
    } catch (e) {
      if (chunk.length <= 1 || !/too many SQL variables/i.test(String(e))) throw e;
      const mid = Math.ceil(chunk.length / 2);
      return (await this._ingestChunk(chunk.slice(0, mid))) + (await this._ingestChunk(chunk.slice(mid)));
    }
  }

  async sourceState(adapterId) {
    const row = await this.db
      .prepare(`SELECT last_polled_at, last_ok_at FROM source_state WHERE adapter_id = ?`)
      .bind(adapterId)
      .first();
    return { lastPollledAt: row?.last_polled_at ?? null, lastOkAt: row?.last_ok_at ?? null };
  }

  async isStale(adapterId, intervalMs, now = Date.now()) {
    const { lastPollledAt } = await this.sourceState(adapterId);
    if (!lastPollledAt) return true;
    const at = Date.parse(lastPollledAt);
    return !Number.isFinite(at) || now - at >= intervalMs;
  }

  async recordPoll(adapterId, rows, error) {
    const at = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO source_state (adapter_id, last_polled_at, last_ok_at, last_error, last_rows)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(adapter_id) DO UPDATE SET
           last_polled_at = excluded.last_polled_at,
           last_ok_at = CASE WHEN excluded.last_error IS NULL THEN excluded.last_ok_at ELSE source_state.last_ok_at END,
           last_error = excluded.last_error,
           last_rows = excluded.last_rows`,
      )
      .bind(adapterId, at, error ? null : at, error ?? null, rows)
      .run();
  }

  async pruneOlderThan(days) {
    const cutoff = new Date(Date.now() + 8 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 19);
    const res = await this.db.prepare(`DELETE FROM observations WHERE measured_at < ?`).bind(cutoff).run();
    return Number(res.meta.changes ?? 0);
  }

  // ---- Telegram subscriptions + alert state (D1 mirror of the SQLite Store) ----

  async getSubscriptions(enabledOnly = true) {
    const sql = `SELECT chat_id, town_slug, state, place, alert_types, enabled FROM chat_subscriptions${enabledOnly ? " WHERE enabled = 1" : ""} ORDER BY chat_id`;
    const res = await this.db.prepare(sql).all();
    return res.results.map((r) => ({
      chatId: Number(r.chat_id), townSlug: String(r.town_slug), state: String(r.state),
      place: String(r.place), alertTypes: String(r.alert_types).split(",").filter(Boolean), enabled: Number(r.enabled) === 1,
    }));
  }

  async getSubscription(chatId) {
    const r = await this.db.prepare(`SELECT chat_id, town_slug, state, place, alert_types, enabled FROM chat_subscriptions WHERE chat_id = ?`).bind(chatId).first();
    return r ? { chatId: Number(r.chat_id), townSlug: String(r.town_slug), state: String(r.state), place: String(r.place), alertTypes: String(r.alert_types).split(",").filter(Boolean), enabled: Number(r.enabled) === 1 } : null;
  }

  async upsertSubscription(s) {
    await this.db.prepare(
      `INSERT INTO chat_subscriptions (chat_id, town_slug, state, place, alert_types, enabled)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET
         town_slug = excluded.town_slug, state = excluded.state, place = excluded.place,
         alert_types = excluded.alert_types, enabled = excluded.enabled,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    ).bind(s.chatId, s.townSlug, s.state, s.place, s.alertTypes.join(","), s.enabled ? 1 : 0).run();
  }

  async setChatEnabled(chatId, enabled) {
    await this.db.prepare(`UPDATE chat_subscriptions SET enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE chat_id = ?`).bind(enabled ? 1 : 0, chatId).run();
  }

  async setChatAlertTypes(chatId, alertTypes, enabled = true) {
    await this.db.prepare(`UPDATE chat_subscriptions SET alert_types = ?, enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE chat_id = ?`).bind(alertTypes.join(","), enabled ? 1 : 0, chatId).run();
  }

  async alertStateForChat(chatId) {
    const res = await this.db.prepare(`SELECT chat_id, kind, key, last_band, last_value, last_alert_at, last_recovery_at FROM alert_state WHERE chat_id = ? ORDER BY kind, key`).bind(chatId).all();
    return res.results.map((r) => ({
      chatId: Number(r.chat_id), kind: String(r.kind), key: String(r.key),
      lastBand: r.last_band == null ? null : String(r.last_band), lastValue: r.last_value == null ? null : Number(r.last_value),
      lastAlertAt: r.last_alert_at == null ? null : String(r.last_alert_at), lastRecoveryAt: r.last_recovery_at == null ? null : String(r.last_recovery_at),
    }));
  }

  async getAlertState(chatId, kind, key) {
    const r = await this.db.prepare(`SELECT chat_id, kind, key, last_band, last_value, last_alert_at, last_recovery_at FROM alert_state WHERE chat_id = ? AND kind = ? AND key = ?`).bind(chatId, kind, key).first();
    return r ? { chatId: Number(r.chat_id), kind: String(r.kind), key: String(r.key), lastBand: r.last_band == null ? null : String(r.last_band), lastValue: r.last_value == null ? null : Number(r.last_value), lastAlertAt: r.last_alert_at == null ? null : String(r.last_alert_at), lastRecoveryAt: r.last_recovery_at == null ? null : String(r.last_recovery_at) } : null;
  }

  async setAlertState(row) {
    await this.db.prepare(
      `INSERT INTO alert_state (chat_id, kind, key, last_band, last_value, last_alert_at, last_recovery_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, kind, key) DO UPDATE SET
         last_band = excluded.last_band, last_value = excluded.last_value,
         last_alert_at = excluded.last_alert_at, last_recovery_at = excluded.last_recovery_at`,
    ).bind(row.chatId, row.kind, row.key, row.lastBand, row.lastValue, row.lastAlertAt, row.lastRecoveryAt).run();
  }
}
