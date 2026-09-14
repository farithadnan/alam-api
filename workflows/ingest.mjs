/**
 * Ingest runner — feeds D1 exactly as it would be fed in prod.
 *
 * Runs OUTSIDE the Worker (free Worker CPU is 10ms; parsing thousands of rows belongs
 * here), on your machine in dev and under GitHub Actions cron in prod. It reuses the
 * same adapters the old Fastify scheduler used, honours per-source intervals, and POSTs
 * the resulting observations to the Worker's auth-protected /_internal/ingest endpoint.
 *
 *   DEV :  INGEST_BASE=http://localhost:8788  npx tsx workflows/ingest.mjs
 *   PROD: INGEST_BASE=https://<host>         (via GH Actions, INGEST_SECRET as a secret)
 */
import { loadConfig, cadenceFor } from "../src/util/config.js";
import { buildAdapters } from "../src/adapters/registry.js";

const BASE = process.env.INGEST_BASE || "http://localhost:8788";
const SECRET = process.env.INGEST_SECRET || "";
const CONCURRENCY = 4;

const cfg = loadConfig(process.env);
const cadence = cadenceFor(cfg);
const adapters = buildAdapters(cfg);

const H = () => ({ "content-type": "application/json", "x-ingest-secret": SECRET });

async function sourceStatus(id, intervalMs) {
  const r = await fetch(`${BASE}/_internal/source?adapterId=${encodeURIComponent(id)}&intervalMs=${intervalMs}`, { headers: H() });
  if (!r.ok) throw new Error(`source status ${r.status}`);
  return r.json();
}

async function push(id, rows) {
  // Keep each POST to a single small D1 statement: free Workers cap CPU at 10ms/invocation,
  // so a whole-adapter batch in one request gets killed with 503. Chunk here.
  const N = Number(process.env.PUSH_CHUNK || 100);
  let total = 0;
  for (let i = 0; i < rows.length; i += N) {
    const chunk = rows.slice(i, i + N);
    const r = await fetch(`${BASE}/_internal/ingest`, { method: "POST", headers: H(), body: JSON.stringify({ adapterId: id, rows: chunk }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`ingest ${r.status} ${JSON.stringify(j)}`);
    total += j.inserted ?? 0;
  }
  return { inserted: total };
}

async function runOne(adapter) {
  const interval = cadence(adapter.id);
  let stale = true;
  try { stale = (await sourceStatus(adapter.id, interval)).stale !== false; }
  catch { /* status down -> poll anyway */ }
  if (!stale) { console.log(`[${adapter.id}] fresh, skip`); return; }
  const t0 = Date.now();
  const rows = await adapter.poll();
  const { inserted } = await push(adapter.id, rows);
  console.log(`[${adapter.id}] ${rows.length} parsed, ${inserted} new, ${Date.now() - t0}ms`);
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  const out = new Array(items.length);
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  if (!SECRET) { console.error("INGEST_SECRET not set"); process.exit(2); }
  const t0 = Date.now();
  await mapLimit(adapters, CONCURRENCY, (a) => runOne(a).catch((e) => console.error(`[${a.id}] ${e.message}`)));
  console.log(`[runner] cycle done in ${Date.now() - t0}ms`);
}

main();
