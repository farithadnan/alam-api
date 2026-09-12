/**
 * Edge-triggered alert state machine.
 *
 * Decisions are pure: given a chat's subscription, its last recorded state, and the
 * latest observations, it returns the messages to send and the state to persist. That
 * keeps the whole policy testable without Telegram or the network, and the coordinator
 * (notifier) is a thin shell over this.
 *
 * Contract: a steady level sends exactly one message — a multi-day haze in an
 * "Unhealthy" band alerts once on the way in and sends one recovery when it clears.
 * Only actual *crossings* (a move into a worse band, or a return to clean air) fire.
 *
 * Cold start: a chat's first evaluation (no persisted state yet) settles a silent
 * baseline — it marks whatever is currently present as already seen and sends nothing,
 * so the notifier never dumps a backlog of historical warnings/quakes at a brand-new
 * subscriber. Only genuinely new events after that alert. (The one exception: air that
 * is *already* unhealthy at first contact gets a single current-condition alert.)
 */

import { aqiBand } from "../core/bands.js";
import { MALAYSIA_LOCALITIES } from "../core/localities.js";
import { aqiMsg, aqiRecoveredMsg, warningMsg, quakeMsg } from "../core/messages.js";
import type { ObservationRow } from "../store/db.js";
import type { ChatSubscription, AlertStateRow } from "../store/db.js";

/** Malaysian AQI bands in worsening order. Index 2 ("Unhealthy") is the alert threshold. */
export const BAND_ORDER = ["Good", "Moderate", "Unhealthy", "Very Unhealthy", "Hazardous"] as const;
export const ALERT_BAND_INDEX = 2;
/** Minimum wait before re-alerting the same chat after it cleared, to stop flap spam. */
export const ALERT_COOLDOWN_MS = 30 * 60_000;
/** Only quakes at/above this magnitude and within this many km of the place are surfaced. */
export const QUAKE_MIN_MAG = 5.0;
export const QUAKE_MAX_KM = 400;

export interface OutboundAlert {
  chatId: number;
  text: string;
}

export interface EvaluateInput {
  sub: ChatSubscription;
  /** This chat's previous state rows (preloaded). Empty on first evaluation. */
  prev: AlertStateRow[];
  /** Latest DOE APIMS readings for every state (source doe-eqms only — the APIMS scale). */
  aqi: ObservationRow[];
  /** Latest MET warnings (kind "warning"). */
  warnings: ObservationRow[];
  /** Latest USGS quakes (kind "quake"). */
  quakes: ObservationRow[];
  /** Where alerts link back to (site base URL). */
  url: string;
  now?: number;
  cooldownMs?: number;
}

export interface EvaluateResult {
  send: OutboundAlert[];
  /** State rows the coordinator should upsert. */
  next: AlertStateRow[];
}

/** A warning is identified by its title *and* issue time, so a re-issued warning of
 * the same type is a new alert rather than being swallowed by the last one. */
export const warningKey = (w: ObservationRow): string => `${w.station}|${w.measuredAt}`;

export function bandIndex(label: string): number {
  const i = BAND_ORDER.indexOf(label as (typeof BAND_ORDER)[number]);
  return i < 0 ? -1 : i;
}

const cooldownOk = (lastIso: string | null | undefined, now: number, cd: number): boolean =>
  !lastIso || now - Date.parse(lastIso) >= cd;

/** Distance (km) between two lat/lon points on a sphere. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The DOE station serving a chat's place: name match first, then nearest to the town. */
function pickAqiStation(sub: ChatSubscription, aqi: ObservationRow[]): ObservationRow | null {
  const rows = aqi.filter((r) => (r.meta?.state as string | undefined) === sub.state);
  if (!rows.length) return null;
  const town = MALAYSIA_LOCALITIES.find((l) => l.slug === sub.townSlug);
  const townName = town?.name.toLowerCase() ?? "";
  const nameHit = rows.find((r) => {
    const n = r.stationName.toLowerCase();
    return townName && (n.includes(townName) || townName.includes(n));
  });
  if (nameHit) return nameHit;
  if (town) {
    let best = rows[0]!;
    let bestKm = Infinity;
    for (const r of rows) {
      const lat = r.meta?.lat as number | undefined;
      const lon = r.meta?.lon as number | undefined;
      if (typeof lat === "number" && typeof lon === "number") {
        const km = haversineKm(town.lat, town.lon, lat, lon);
        if (km < bestKm) {
          bestKm = km;
          best = r;
        }
      }
    }
    return best;
  }
  return rows[0]!;
}

/** A warning matters to a chat when its title/body names the chat's state or town. */
function warningHits(sub: ChatSubscription, warnings: ObservationRow[]): ObservationRow[] {
  const town = MALAYSIA_LOCALITIES.find((l) => l.slug === sub.townSlug);
  const words = [sub.state, town?.name ?? sub.place]
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 0);
  return warnings.filter((w) => {
    if (w.kind !== "warning") return false;
    const hay = `${w.stationName} ${w.meta?.headingEn ?? ""} ${w.meta?.textEn ?? ""} ${w.meta?.titleBm ?? ""}`.toLowerCase();
    return words.some((word) => hay.includes(word));
  });
}

const validUntil = (w: ObservationRow): string | null | undefined =>
  (w.meta?.validTo as string | null | undefined) ?? (w.meta?.validFrom as string | null | undefined);

/** Evaluate one chat against the latest observations. Pure: no I/O. */
export function evaluateChat(input: EvaluateInput): EvaluateResult {
  const out: EvaluateResult = { send: [], next: [] };
  const { sub, prev, now: nowInput, url } = input;
  const now = nowInput ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const cd = input.cooldownMs ?? ALERT_COOLDOWN_MS;
  // A chat with no persisted state is settling in: baseline, don't dump history.
  const coldStart = prev.length === 0;
  const state = new Map<string, AlertStateRow>(prev.map((r) => [`${r.kind}:${r.key}`, r]));
  const enabled = (t: string) => sub.alertTypes.includes(t);
  // Push a state row AND add it to the seen-set, so two records of the same key in a
  // single pass do not both alert (the newsletter-style burst is blocked here).
  const record = (row: AlertStateRow): void => {
    out.next.push(row);
    state.set(`${row.kind}:${row.key}`, row);
  };

  // AQI — the headline alert type.
  if (enabled("aqi")) {
    const st = pickAqiStation(sub, input.aqi);
    if (st) {
      const key = st.station;
      const band = aqiBand(st.value).label;
      const curIdx = bandIndex(band);
      const prior = state.get(`aqi:${key}`);
      const prevIdx = prior?.lastBand != null ? bandIndex(prior.lastBand) : -1;
      const fresh: AlertStateRow = {
        chatId: sub.chatId,
        kind: "aqi",
        key,
        lastBand: band,
        lastValue: st.value,
        lastAlertAt: prior?.lastAlertAt ?? null,
        lastRecoveryAt: prior?.lastRecoveryAt ?? null,
      };

      if (curIdx >= ALERT_BAND_INDEX) {
        if (coldStart) {
          // First contact and the air is already poor: one current-condition alert,
          // then settle the baseline so this level is never re-nagged.
          out.send.push({ chatId: sub.chatId, text: aqiMsg({ value: st.value, band, place: sub.place, advice: aqiBand(st.value).advice, url }) });
          fresh.lastAlertAt = nowIso;
        } else {
          const worsenedFromClean = prior == null || prevIdx < ALERT_BAND_INDEX;
          const climbedWithin = !worsenedFromClean && curIdx > prevIdx;
          // A deterioration to a worse band always informs; re-entering the alert tier
          // is gated by the cooldown so rapid flapping does not nag.
          if (prior == null || climbedWithin || (worsenedFromClean && cooldownOk(fresh.lastAlertAt, now, cd))) {
            out.send.push({ chatId: sub.chatId, text: aqiMsg({ value: st.value, band, place: sub.place, advice: aqiBand(st.value).advice, url }) });
            fresh.lastAlertAt = nowIso;
          }
        }
        record(fresh);
      } else {
        // Clean band: the recovery fires once, on the first return from an alert level.
        const recovering = !coldStart && prior != null && prevIdx >= ALERT_BAND_INDEX;
        if (recovering && cooldownOk(fresh.lastRecoveryAt, now, cd)) {
          out.send.push({ chatId: sub.chatId, text: aqiRecoveredMsg({ value: st.value, band, place: sub.place, url }) });
          fresh.lastRecoveryAt = nowIso;
        }
        record(fresh);
      }
    }
  }

  // Warnings — one message per distinct issuance for the chat's place. On cold start
  // the existing feed is folded into the baseline (marked seen, nothing sent), so a
  // subscriber never gets a backlog of old bulletins.
  if (enabled("warning")) {
    for (const w of warningHits(sub, input.warnings)) {
      const key = warningKey(w);
      if (state.get(`warning:${key}`)?.lastAlertAt) continue;
      const row: AlertStateRow = { chatId: sub.chatId, kind: "warning", key, lastBand: null, lastValue: w.value, lastAlertAt: nowIso, lastRecoveryAt: null };
      if (!coldStart) {
        out.send.push({ chatId: sub.chatId, text: warningMsg({ title: w.stationName, place: sub.place, issuedAt: w.measuredAt, validUntil: validUntil(w), url }) });
      }
      record(row);
    }
  }

  // Quakes — significant and near the place, once per event.
  if (enabled("quake")) {
    const town = MALAYSIA_LOCALITIES.find((l) => l.slug === sub.townSlug);
    if (town) {
      for (const q of input.quakes) {
        if (q.kind !== "quake" || q.value < QUAKE_MIN_MAG) continue;
        const key = q.station; // USGS event id — already unique per event
        if (state.get(`quake:${key}`)?.lastAlertAt) continue;
        const lat = q.meta?.lat as number | undefined;
        const lon = q.meta?.lon as number | undefined;
        if (typeof lat !== "number" || typeof lon !== "number") continue;
        if (haversineKm(town.lat, town.lon, lat, lon) > QUAKE_MAX_KM) continue;
        const row: AlertStateRow = { chatId: sub.chatId, kind: "quake", key, lastBand: null, lastValue: q.value, lastAlertAt: nowIso, lastRecoveryAt: null };
        if (!coldStart) {
          out.send.push({ chatId: sub.chatId, text: quakeMsg({ magnitude: q.value, place: q.stationName, depthKm: (q.meta?.depth as number | null | undefined) ?? null, at: q.measuredAt, url }) });
        }
        record(row);
      }
    }
  }

  return out;
}
