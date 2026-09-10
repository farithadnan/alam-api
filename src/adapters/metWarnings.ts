import { fetchJson } from "../util/http.js";
import type { Adapter } from "./types.js";
import type { Observation } from "../core/types.js";

interface MetWarning {
  warning_issue?: { issued?: string; title_en?: string; title_bm?: string };
  valid_from?: string;
  valid_to?: string;
  heading_en?: string;
  text_en?: string;
}

/** Malaysia's official open weather API (api.data.gov.my, data sourced by MET Malaysia). */
const WARNINGS_URL = "https://api.data.gov.my/weather/warning";

const CATEGORY = /(FIRST|SECOND|THIRD)\s+CATEGORY/i;
const SEVERITY: Record<string, number> = { FIRST: 1, SECOND: 2, THIRD: 3 };

function slug(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/**
 * MET Malaysia weather warnings — heavy rain / strong wind / rough seas / heat,
 * served as bilingual (EN+BM) items. Official, free, no auth. These are the
 * warnings that actually matter for daily life in Malaysia; surfaced in Hazards.
 */
export class MetWarningsAdapter implements Adapter {
  readonly id = "my-met" as const;

  async poll(): Promise<Observation[]> {
    const items = await fetchJson<MetWarning[]>(WARNINGS_URL, { headers: { accept: "application/json" } });
    const out: Observation[] = [];
    for (const w of items) {
      const title = w.warning_issue?.title_en || w.heading_en || "Weather warning";
      const titleBm = w.warning_issue?.title_bm || "";
      if (/(tiada nasihat|no advisory|no warning)/i.test(`${title} ${titleBm} ${w.heading_en ?? ""}`)) continue; // "no advisory" sentinel
      const cat = CATEGORY.exec(w.heading_en || "");
      const severity = (cat && SEVERITY[cat[1]!]) || 1;
      out.push({
        source: "my-met",
        station: slug(title),
        stationName: title,
        measuredAt: w.warning_issue?.issued || w.valid_to || new Date().toISOString(),
        kind: "warning",
        value: severity,
        meta: {
          titleBm,
          headingEn: w.heading_en ?? null,
          textEn: w.text_en ?? null,
          validFrom: w.valid_from ?? null,
          validTo: w.valid_to ?? null,
        },
      });
    }
    return out;
  }
}
