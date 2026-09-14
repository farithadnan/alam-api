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
}
