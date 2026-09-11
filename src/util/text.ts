/** URL/id-safe slug — shared by every adapter that keys rows by a name. */
export function slug(s: string, max = 60): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, max);
}
