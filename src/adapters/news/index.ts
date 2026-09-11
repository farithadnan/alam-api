import { fetchJson, fetchText } from "../../util/http.js";
import type { Adapter } from "../types.js";
import type { Observation } from "../../core/types.js";

/** Weather/hazard relevance filter — keeps the feed useful rather than generic news. */
const KEYWORDS =
  /\b(flood|floods|flooding|haze|hazy|weather|storm|storms|thunderstorm|thunderstorms|rain|rainfall|monsoon|drought|heatwave|heat wave|earthquake|quake|tsunami|landslide|typhoon|cyclone|aqi|air quality|el niño|el nino|la niña|la nina|banjir|hujan|jerebu|cuaca|ribut|gempa|kemarau|kabus)\b/i;

interface Feed {
  outlet: string;
  url: string;
}

/** Free Malaysian RSS feeds (no key, no quota). Used as a secondary source. */
const DEFAULT_FEEDS: Feed[] = [
  { outlet: "Free Malaysia Today", url: "https://www.freemalaysiatoday.com/category/nation/feed/" },
  { outlet: "New Straits Times", url: "https://www.nst.com.my/feed" },
  { outlet: "Utusan Malaysia", url: "https://www.utusan.com.my/feed" },
];

/**
 * newsdata.io — paid-tier news API (key required, 200 credits/day on the free
 * tier, up to 10 articles per credit). We query regional coverage and then
 * apply our own weather/hazard relevance filter, because the search is fuzzy.
 */
const NEWSDATA_URL = "https://newsdata.io/api/1/latest";
const NEWSDATA_COUNTRIES = "my,sg,th,id,ph";
const NEWSDATA_CATEGORIES = "environment,health";
const NEWSDATA_QUERY = "flood OR haze OR weather OR rain OR earthquake OR air quality";
const REQUEST_TIMEOUT_MS = 15_000;

interface NewsdataItem {
  title?: string | null;
  link?: string | null;
  source_name?: string | null;
  pubDate?: string | null;
  description?: string | null;
}
interface NewsdataResponse {
  status?: string;
  results?: NewsdataItem[];
}

function relevance(text: string): boolean {
  return KEYWORDS.test(text);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

/**
 * Malaysia-relevant weather & hazard news.
 * Primary: newsdata.io (when a key is configured). Secondary: free Malaysian
 * RSS feeds. Both are normalised to the same shape and de-duplicated by URL,
 * so the feed degrades gracefully when the key is missing or a quota is spent.
 */
export class NewsAdapter implements Adapter {
  readonly id = "news" as const;

  constructor(private readonly apiKey?: string) {}

  private async fromNewsdata(): Promise<Observation[]> {
    if (!this.apiKey) return [];
    const url =
      `${NEWSDATA_URL}?apikey=${encodeURIComponent(this.apiKey)}` +
      `&country=${NEWSDATA_COUNTRIES}&language=en&category=${NEWSDATA_CATEGORIES}` +
      `&size=10&q=${encodeURIComponent(NEWSDATA_QUERY)}`;
    const data = await fetchJson<NewsdataResponse>(url, { timeoutMs: REQUEST_TIMEOUT_MS, retries: 1 });
    const out: Observation[] = [];
    for (const a of data.results ?? []) {
      const title = (a.title ?? "").trim();
      const link = (a.link ?? "").trim();
      if (!title || !link) continue;
      if (!relevance(`${title} ${a.description ?? ""}`)) continue;
      out.push({
        source: "news" as const,
        station: slug(link),
        stationName: title.slice(0, 200),
        measuredAt: a.pubDate ? new Date(a.pubDate.replace(" ", "T") + "Z").toISOString() : new Date().toISOString(),
        kind: "news" as const,
        value: 0,
        meta: { url: link, outlet: a.source_name ?? "newsdata.io" },
      });
    }
    return out;
  }

  /** Parse <item> entries from an RSS feed without an XML dependency. */
  private parseRss(xml: string, outlet: string): Observation[] {
    const out: Observation[] = [];
    for (const item of xml.split(/<item[\s>]/).slice(1)) {
      const title = (/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(item)?.[1] ?? "").trim();
      const link = (/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/.exec(item)?.[1] ?? "").trim();
      const date = (/<pubDate>([\s\S]*?)<\/pubDate>/.exec(item)?.[1] ?? "").trim();
      if (!title || !link || !relevance(title)) continue;
      out.push({
        source: "news" as const,
        station: slug(link),
        stationName: title.slice(0, 200),
        measuredAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : new Date().toISOString(),
        kind: "news" as const,
        value: 0,
        meta: { url: link, outlet },
      });
    }
    return out;
  }

  private async fromFeeds(): Promise<Observation[]> {
    const results = await Promise.allSettled(
      DEFAULT_FEEDS.map(async (f) => this.parseRss(await fetchText(f.url), f.outlet)),
    );
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  }

  async poll(): Promise<Observation[]> {
    const [primary, secondary] = await Promise.all([
      this.fromNewsdata().catch(() => [] as Observation[]),
      this.fromFeeds().catch(() => [] as Observation[]),
    ]);
    const seen = new Set<string>();
    const out: Observation[] = [];
    for (const o of [...primary, ...secondary]) {
      if (seen.has(o.station)) continue;
      seen.add(o.station);
      out.push(o);
    }
    return out;
  }
}
