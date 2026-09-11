/**
 * Detect drift between what we store and what MET publishes.
 *
 * Two independent checks:
 *   1. registry vs live feed  - a district added, removed or renamed upstream
 *   2. crosswalk vs registry  - a town mapping that no longer resolves
 *
 * Exit codes: 0 no drift, 1 drift found, 2 could not check (network/feed problem).
 * So it can run on a schedule without a rate-limited feed looking like success.
 *
 *   npm run check:drift
 */
import { fetchJson } from "../src/util/http.js";
import { MET_DISTRICTS } from "../src/core/metDistricts.js";
import { MALAYSIA_LOCALITIES } from "../src/core/localities.js";
import { districtFor } from "../src/core/townDistricts.js";
import { Store } from "../src/store/db.js";
import { loadConfig } from "../src/util/config.js";

const FORECAST_URL = "https://api.data.gov.my/weather/forecast?limit=5000";

interface Row { location?: { location_id?: string; location_name?: string } }

// Uses the shared fetch layer: per-host throttle + backoff that honours Retry-After,
// so running this check never adds to a rate-limit problem.
let body: unknown;
try {
  body = await fetchJson<unknown>(FORECAST_URL, { retries: 2 });
} catch (err) {
  console.error(`feed unreachable (${err instanceof Error ? err.message : err}) - drift not checked`);
  process.exit(2);
}
if (!Array.isArray(body)) {
  // Distinguish "could not run" from "drift found": a rate-limited or erroring feed
  // must not look like a clean result, and must not crash the scheduled check.
  console.error(`feed: unexpected response (${typeof body}) - drift not checked`);
  process.exit(2);
}
const rows = body as Row[];
const live = new Map<string, string>();
for (const r of rows) {
  const id = r.location?.location_id, name = r.location?.location_name;
  if (id && name) live.set(id, name);
}

const store = new Store(loadConfig().DB_PATH);
const problems: string[] = [];

// 1. registry vs feed
const newDistricts = [...live.keys()].filter((id) => id.startsWith("Ds") && !(id in MET_DISTRICTS));
const goneDistricts = Object.keys(MET_DISTRICTS).filter((id) => !live.has(id));
const renamed = Object.entries(MET_DISTRICTS)
  .filter(([id, [name]]) => live.has(id) && live.get(id) !== name)
  .map(([id, [name]]) => `${id}: registry "${name}" vs feed "${live.get(id)}"`);
for (const id of newDistricts) problems.push(`new district in feed: ${id} (${live.get(id)}) — add to the registry`);
for (const id of goneDistricts) problems.push(`district gone from feed: ${id} (${MET_DISTRICTS[id][0]}) — remove from the registry`);
for (const r of renamed) problems.push(`district renamed: ${r}`);

// 2. crosswalk vs registry
for (const l of MALAYSIA_LOCALITIES) {
  const d = districtFor(l.slug, store.townDistrict(l.slug));
  if (!d) problems.push(`town unmapped: ${l.slug} — add it to data/town-districts.csv`);
}

store.close();
console.log(`feed districts: ${[...live.keys()].filter((i) => i.startsWith("Ds")).length} | registry: ${Object.keys(MET_DISTRICTS).length} | towns: ${MALAYSIA_LOCALITIES.length}`);
console.log(problems.length ? `DRIFT (${problems.length}):\n  ${problems.join("\n  ")}` : "no drift");
process.exit(problems.length ? 1 : 0);
