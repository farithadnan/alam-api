/**
 * Resolve free-text place input ("arau perlis", "Johor Bahru") to a locality we
 * actually poll, so a chat's place always carries coords and a district upstream.
 * Returns null for anything we cannot map — the bot then asks again rather than
 * subscribing to a place it cannot evaluate.
 */

import { MALAYSIA_LOCALITIES, type Locality } from "../core/localities.js";
import { parsePayload } from "../core/messages.js";

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

/**
 * Best (non-empty) locality match for a number of words. Tries the full town+state
 * phrase first, then the town alone, then the town slug. Case- and punctuation-tolerant.
 */
export function resolveLocality(words: string[]): Locality | null {
  const phrase = words.filter(Boolean).join(" ").toLowerCase();
  const phraseWithState = (l: Locality) => `${l.name} ${l.state}`.toLowerCase() === phrase;
  const nameOnly = (l: Locality) => l.name.toLowerCase() === phrase;
  const slugHit = phrase.replace(/\s+/g, "-");
  return (
    MALAYSIA_LOCALITIES.find(phraseWithState) ??
    MALAYSIA_LOCALITIES.find(nameOnly) ??
    MALAYSIA_LOCALITIES.find((l) => l.slug === slugHit || slug(l.name) === slugHit) ??
    null
  );
}

/**
 * A /start deep-link payload ("loc_arau_perlis") resolves to a locality too, by
 * its parsed town+state names. Falls back to null when the link names something
 * we do not poll, so the /start reply nudges the user to pick a known place.
 */
export function resolvePayload(payload?: string | null): Locality | null {
  const parsed = parsePayload(payload);
  if (!parsed) return null;
  return resolveLocality([parsed.town, parsed.state]);
}
