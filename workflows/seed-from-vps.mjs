/**
 * Seed a D1 via the Worker's /_internal/ingest from an existing SQLite snapshot.
 *
 * Used to carry the old VPS SQLite's accumulated history into the new serverless D1s
 * (dev now, prod at cutover) so trend/history parity is instant. Idempotent: INSERT OR
 * IGNORE means re-running only backfills whatever D1 still lacks.
 *
 *   DEV :  node workflows/seed-from-vps.mjs            (reads data/udara.db -> :8788)
 *   PROD:  INGEST_BASE=https://<host> node workflows/seed-from-vps.mjs
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const BASE = process.env.INGEST_BASE || "http://localhost:8788";
const DB_PATH = process.env.SEED_DB || new URL("../data/udara.db", import.meta.url).pathname;

function loadSecret() {
  if (process.env.INGEST_SECRET) return process.env.INGEST_SECRET;
  try {
    const v = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
    return v.match(/^INGEST_SECRET=(.+)$/m)?.[1]?.trim() ?? "";
  } catch { return ""; }
}
const secret = loadSecret();
if (!secret) { console.error("INGEST_SECRET not set (env or .dev.vars)"); process.exit(2); }

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const stmt = db.prepare("SELECT source, station, station_name, measured_at, kind, value, meta FROM observations");
const rows = stmt.all().map((r) => ({
  source: r.source, station: r.station, stationName: r.station_name, measuredAt: r.measured_at,
  kind: r.kind, value: r.value, meta: r.meta != null ? JSON.parse(r.meta) : null,
}));
console.log(`read ${rows.length} rows from ${DB_PATH}`);

const CHUNK = Number(process.env.SEED_CHUNK || 100);
const H = { "content-type": "application/json", "x-ingest-secret": secret };
let insertedTotal = 0, failed = 0;
async function push(chunk) {
  const res = await fetch(`${BASE}/_internal/ingest`, { method: "POST", headers: H, body: JSON.stringify({ adapterId: "seed", rows: chunk }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(j).slice(0, 160)}`);
  return j.inserted ?? 0;
}
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  let inserted = null;
  for (let attempt = 1; attempt <= 3 && inserted === null; attempt++) {
    try { inserted = await push(chunk); }
    catch (e) { if (attempt === 3) { failed++; console.error(`chunk ${i}: ${e.message}`); } else { await new Promise((r) => setTimeout(r, 400 * attempt)); } }
  }
  insertedTotal += inserted ?? 0;
  if (i % 2500 === 0) console.log(`progress ${i}/${rows.length} (inserted ${inserted})`);
}
console.log(`DONE. total inserted ${insertedTotal}, failed chunks ${failed}`);
