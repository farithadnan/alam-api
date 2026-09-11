/**
 * Generate src/core/townDistricts.ts from:
 *   - the locality list (towns we poll)
 *   - the district registry (MET location_id -> district + state)
 *   - data/town-districts.csv (only the rows that CANNOT be derived by name)
 *
 * The CSV records what is *asserted* rather than verified: the weather feed does not
 * publish which district a town is in, so those rows are a person's assertion. The
 * district->state half of each row is authoritative (MET's own selector).
 *
 * Identity rows (town name == district name, 76 of 108) are derived here, so the
 * CSV stays a short list of genuine exceptions, each with its provenance.
 *
 *   npm run crosswalk
 */
import fs from "node:fs";
import { MALAYSIA_LOCALITIES } from "../src/core/localities.js";
import { districtsOf } from "../src/core/metDistricts.js";

const CSV = "data/town-districts.csv";
const OUT = "src/core/townDistricts.ts";

/** Minimal CSV reader: handles double-quoted fields containing commas. */
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field.trim()); field = ""; }
    else if (c === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows.filter((r) => r.length && r.some((c) => c) && !r[0].startsWith("#"));
}

const [header, ...rows] = readCsv(fs.readFileSync(CSV, "utf8"));
const col = (name: string) => header.indexOf(name);
if (col("town_slug") < 0 || col("district_name") < 0 || col("source") < 0 || col("asserted_at") < 0) {
  throw new Error(`${CSV}: expected columns town_slug,district_name,source,asserted_at (got ${header.join(",")})`);
}
const exceptions = new Map<string, { district: string; source: string; verifiedAt: string }>();
for (const r of rows) {
  exceptions.set(r[col("town_slug")], {
    district: r[col("district_name")],
    source: r[col("source")],
    assertedAt: r[col("asserted_at")],
  });
}

const problems: string[] = [];
const out: { slug: string; district: string; state: string; how: string }[] = [];
for (const l of MALAYSIA_LOCALITIES) {
  const districts = districtsOf(l.state).map((d) => d.name);
  const identity = districts.find((d) => d.toLowerCase() === l.name.toLowerCase());
  const ex = exceptions.get(l.slug);
  const district = ex?.district ?? identity;
  if (!district) problems.push(`${l.slug} (${l.state}): no district — add it to ${CSV}`);
  else if (!districts.includes(district)) {
    problems.push(`${l.slug}: "${district}" is not a ${l.state} district`);
  } else out.push({ slug: l.slug, district, state: l.state, how: ex ? `csv: ${ex.source}` : "derived from name" });
}
// stale exceptions: a CSV row that the generator no longer needs
for (const [slug, ex] of exceptions) {
  const l = MALAYSIA_LOCALITIES.find((x) => x.slug === slug);
  if (!l) problems.push(`${CSV}: unknown town slug "${slug}"`);
  else if (districtsOf(l.state).some((d) => d.name.toLowerCase() === l.name.toLowerCase())) {
    problems.push(`${CSV}: "${slug}" is a name identity row, remove it (district ${ex.district})`);
  }
}
if (problems.length) {
  console.error("crosswalk: refusing to generate\n  " + problems.join("\n  "));
  process.exit(1);
}

const lines = [
  "/**",
  " * Town -> MET district, for every locality we poll. GENERATED FILE - do not edit.",
  ` * Regenerate with: npm run crosswalk   (source: ${CSV})`,
  " *",
  " * Most rows are derived from name identity. The rest are stated in the CSV with",
  " * their provenance, because the weather feed does not record which district a town",
  " * belongs to and the two lists are named independently.",
  " *",
  ` * ${out.filter((r) => r.how.startsWith("csv")).length} of ${out.length} rows come from the CSV; the rest are identity.`,
  " */",
  "",
  "/** MET district for a locality slug. */",
  "export const TOWN_DISTRICT: Record<string, string> = {",
  ...out.sort((a, b) => a.slug.localeCompare(b.slug)).map((r) => `  "${r.slug}": "${r.district}", // ${r.state} · ${r.how}`),
  "};",
  "",
  "/** MET district name for a locality slug, or null when unknown. */",
  "export function districtOf(townSlug?: string | null): string | null {",
  "  if (!townSlug) return null;",
  "  return TOWN_DISTRICT[townSlug] ?? null;",
  "}",
  "",
];
fs.writeFileSync(OUT, lines.join("\n"));
const fromCsv = out.filter((r) => r.how.startsWith("csv")).length;
console.log(`crosswalk: ${out.length} towns written to ${OUT} (${out.length - fromCsv} derived, ${fromCsv} from ${CSV})`);
