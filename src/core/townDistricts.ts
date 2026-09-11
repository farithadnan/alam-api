import { MALAYSIA_LOCALITIES } from "./localities.js";
import { districtsOf } from "./metDistricts.js";

/**
 * Resolve a locality slug to its MET district.
 *
 * `asserted` is the row from the town_districts table (reference data in SQLite),
 * passed in by the caller so this stays a pure function. Only the exceptions live
 * in that table: a town whose name already matches its district is derived here
 * from the locality list and the district registry, so there is no generated file
 * and no separate data format to keep in step.
 *
 * Returns null when the town is unknown, or when an asserted district is not in
 * that town's state (fail safe: never serve another state's forecast).
 */
export function districtFor(townSlug?: string | null, asserted?: string | null): string | null {
  if (!townSlug) return null;
  const town = MALAYSIA_LOCALITIES.find((l) => l.slug === townSlug);
  if (!town) return null;
  const districts = districtsOf(town.state).map((d) => d.name);
  if (asserted) return districts.includes(asserted) ? asserted : null;
  return districts.find((d) => d.toLowerCase() === town.name.toLowerCase()) ?? null;
}

/** True when the slug is a locality we poll. */
export function isLocality(townSlug?: string | null): boolean {
  return !!townSlug && MALAYSIA_LOCALITIES.some((l) => l.slug === townSlug);
}
