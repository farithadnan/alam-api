/**
 * Warning grouping.
 *
 * MET issues one bulletin per state with identical text (the text itself lists every
 * affected state), so a nationwide thunderstorm warning arrived as eight rows and
 * rendered as eight identical cards. Grouping happens here, once, for both the
 * summary and hazards endpoints.
 */

export interface WarningLike {
  title?: string | null;
  severity?: number | null;
  measuredAt?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Stable identity for "is this the same warning?".
 *
 * MET issues one bulletin per state under a single heading, each with its own
 * per-state text. Keying on content therefore kept all eight; keying on metadata
 * kept two. The heading is the real identity, and the survivors are merged below
 * so the card shows the most complete state list.
 */
function keyOf(w: WarningLike): string {
  const meta = w.meta ?? {};
  return String(meta.headingEn ?? w.title ?? "").trim();
}

function textOf(w: WarningLike): string {
  const meta = w.meta ?? {};
  return String(meta.textEn ?? meta.textBm ?? "");
}

/** Collapse identical bulletins, keeping the most recently issued one. */
export function groupWarnings<T extends WarningLike>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, row);
      continue;
    }
    // Keep the most complete text (longest state list) and the newest issue time,
    // so one card carries every affected state rather than a partial list.
    const keep = textOf(row).length > textOf(seen).length ? row : seen;
    const at = String(row.measuredAt ?? "") > String(seen.measuredAt ?? "") ? row.measuredAt : seen.measuredAt;
    byKey.set(key, { ...keep, measuredAt: at ?? keep.measuredAt });

  }
  return [...byKey.values()];
}
