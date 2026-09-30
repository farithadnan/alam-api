/**
 * D1Store — the Store contract over Cloudflare D1, for the Worker.
 *
 * Drop-in read-path replacement for the `Store` (node:sqlite) used by the VPS Fastify
 * server, so handlers that call `store.latestBySource(...)` etc. keep working once their
 * calls are `await`ed (D1 is async; node:sqlite was sync). The SQL + row mapping live in
 * ./queries.js, shared with the node store, so the two runtimes cannot drift.
 *
 * D1 API differences handled here, in one place:
 *   - bind via `.bind(...)` (positional), not `.prepare(...).all(...args)`
 *   - `.all()` returns `{ success, results, meta }` (not a bare array)
 *   - `.first()` returns one row or `null`
 */
import { SQL, observationRow, stationRow, subscriptionRow, alertStateRow, pushSubRow } from "./queries.js";

export class D1Store {
  /** @param {import("@cloudflare/workers-types").D1Database} db */
  constructor(db) {
    this.db = db;
  }

  /** Run a SELECT that maps every row through `map` (defaults to an observation row). */
  async select(sql, params = [], map = observationRow) {
    const prepared = this.db.prepare(sql);
    const res = params.length ? prepared.bind(...params).all() : prepared.all();
    return (await res).results.map(map);
  }

  /** Latest reading per (station, kind) for a source (observed only; no forecast/hourly). */
  async latestBySource(source) {
    return this.select(SQL.latestBySource, [source]);
  }

  async history(source, station, since) {
    return this.select(SQL.history, [source, station, since]);
  }

  async stations() {
    return this.select(SQL.stations, [], stationRow);
  }

  async latestByKind(kind, limit = 50) {
    return this.select(SQL.latestByKind, [kind, limit]);
  }

  async forecast(source) {
    return this.select(SQL.forecast, [source]);
  }

  async hourly(source) {
    return this.select(SQL.hourly, [source]);
  }

  async metForecast() {
    return this.select(SQL.metForecast);
  }

  async hazeFor(station, limit = 7) {
    return this.select(SQL.hazeFor, [station, limit]);
  }

  async townDistrict(townSlug) {
    const row = await this.db.prepare(SQL.townDistrict).bind(townSlug).first();
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
    const placeholders = chunk.map(() => `(?, ?, ?, ?, ?, ?, ?)`).join(", ");
    const vals = chunk.flatMap((r) => [
      r.source, r.station, r.stationName, r.measuredAt, r.kind, r.value,
      r.meta ? JSON.stringify(r.meta) : null,
    ]);
    try {
      const res = await this.db.prepare(SQL.insertObservationPrefix + placeholders).bind(...vals).run();
      return Number(res.meta.changes ?? 0);
    } catch (e) {
      if (chunk.length <= 1 || !/too many SQL variables/i.test(String(e))) throw e;
      const mid = Math.ceil(chunk.length / 2);
      return (await this._ingestChunk(chunk.slice(0, mid))) + (await this._ingestChunk(chunk.slice(mid)));
    }
  }

  async sourceState(adapterId) {
    const row = await this.db.prepare(SQL.sourceState).bind(adapterId).first();
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
    await this.db.prepare(SQL.recordPoll).bind(adapterId, at, error ? null : at, error ?? null, rows).run();
  }

  async pruneOlderThan(days) {
    const cutoff = new Date(Date.now() + 8 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 19);
    const res = await this.db.prepare(SQL.pruneOlderThan).bind(cutoff).run();
    return Number(res.meta.changes ?? 0);
  }

  // ---- Telegram subscriptions + alert state + web push ----

  async getSubscriptions(enabledOnly = true) {
    return this.select(SQL.subscriptions(enabledOnly), [], subscriptionRow);
  }

  async getSubscription(chatId) {
    const r = await this.db.prepare(SQL.subscription).bind(chatId).first();
    return r ? subscriptionRow(r) : null;
  }

  async upsertSubscription(s) {
    await this.db.prepare(SQL.upsertSubscription).bind(s.chatId, s.townSlug, s.state, s.place, s.alertTypes.join(","), s.enabled ? 1 : 0).run();
  }

  async setChatEnabled(chatId, enabled) {
    await this.db.prepare(SQL.setChatEnabled).bind(enabled ? 1 : 0, chatId).run();
  }

  async setChatAlertTypes(chatId, alertTypes, enabled = true) {
    await this.db.prepare(SQL.setChatAlertTypes).bind(alertTypes.join(","), enabled ? 1 : 0, chatId).run();
  }

  async alertStateForChat(chatId) {
    return this.select(SQL.alertStateForChat, [chatId], alertStateRow);
  }

  async getAlertState(chatId, kind, key) {
    const r = await this.db.prepare(SQL.alertState).bind(chatId, kind, key).first();
    return r ? alertStateRow(r) : null;
  }

  async setAlertState(row) {
    await this.db.prepare(SQL.setAlertState).bind(row.chatId, row.kind, row.key, row.lastBand, row.lastValue, row.lastAlertAt, row.lastRecoveryAt).run();
  }

  async listPushSubs() {
    return this.select(SQL.pushSubs, [], pushSubRow);
  }

  async savePushSub(s) {
    await this.db.prepare(SQL.upsertPushSub).bind(s.endpoint, s.p256dh, s.auth, s.town ?? "", s.state ?? "").run();
  }

  async delPush(endpoint) {
    await this.db.prepare(SQL.deletePushSub).bind(endpoint).run();
  }
}