import { fetchText } from "../util/http.js";
import type { Adapter } from "./types.js";
import type { Observation } from "../core/types.js";

/** Malaysian outlets + weather/hazard keywords — keep the feed relevant. */
const DEFAULT_FEEDS: [string, string][] = [
  ["Free Malaysia Today", "https://www.freemalaysiatoday.com/category/nation/feed/"],
  ["New Straits Times", "https://www.nst.com.my/feed"],
  ["Utusan Malaysia", "https://www.utusan.com.my/feed"],
];
const KEYWORDS = /\b(rain|flood|haze|weather|storm|thunder|wind|drought|heat|earthquake|quake|tsunami|monsoon|lightning|banjir|hujan|jerebu|cuaca|ribut|gempa|panas|kemarau|angin|kabus|landslide|tanah runtuh)\b/i;

interface Item { title: string; link: string; date: string }

function parseItems(xml: string): Item[] {
  const out: Item[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const b of blocks) {
    const title = (b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
    const link = (b.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1] ?? "").trim();
    const date = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "").trim();
    if (title && link) out.push({ title, link, date });
  }
  return out;
}

/** Malaysian news RSS filtered to weather/air/hazard stories (best-effort tier). */
export class NewsAdapter implements Adapter {
  readonly id = "news" as const;

  constructor(private readonly feeds: [string, string][] = DEFAULT_FEEDS) {}

  async poll(): Promise<Observation[]> {
    const out: Observation[] = [];
    for (const [source, url] of this.feeds) {
      try {
        const xml = await fetchText(url);
        for (const it of parseItems(xml)) {
          if (!KEYWORDS.test(it.title)) continue;
          const when = it.date ? new Date(it.date) : new Date();
          out.push({
            source: "news",
            station: it.link.slice(0, 200),
            stationName: it.title.slice(0, 200),
            measuredAt: (isNaN(when.getTime()) ? new Date() : when).toISOString(),
            kind: "news",
            value: 0,
            meta: { url: it.link, outlet: source },
          });
        }
      } catch {
        // a feed can be down or rate-limited — skip it, keep the rest
      }
    }
    return out;
  }
}
