// Web-push sender for the serverless stack (run by GH cron, Node).
// For every stored browser subscription, fetch that place's live summary; if there is
// an active warning or unhealthy-or-worse air, send a Web Push (VAPID-signed).
// Kept OUT of the Worker because RFC 8291 payload encryption needs Node crypto; the
// free Worker (10ms CPU) is not the place for it.

import webpush from "web-push";

const BASE = process.env.INGEST_BASE || "";
const SECRET = process.env.INGEST_SECRET || "";
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || "";
if (!BASE || !SECRET || !VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error("missing INGEST_BASE/INGEST_SECRET/VAPID_PUBLIC/VAPID_PRIVATE");
  process.exit(1);
}
webpush.setVapidDetails("mailto:dev@farithadnan.net", VAPID_PUBLIC, VAPID_PRIVATE);

const j = async (url) => {
  const r = await fetch(url, { headers: { "x-ingest-secret": SECRET } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
};

const BAD_BANDS = ["Unhealthy", "Very Unhealthy", "Hazardous"];

try {
  const list = await j(`${BASE}/_internal/push_list`);
  const subs = list.subs ?? [];
  console.log("push subs:", subs.length);

  let sent = 0, skipped = 0, failed = 0;
  for (const s of subs) {
    let sum;
    try {
      sum = await j(`${BASE}/api/summary?state=${encodeURIComponent(s.state || "")}&town=${encodeURIComponent(s.town || "")}`);
    } catch {
      failed++;
      continue;
    }
    const warnings = sum.hazards?.warnings ?? [];
    const station = (sum.stations ?? []).find((x) => x.station === s.town);
    const band = station?.band?.label;
    const bad = band && BAD_BANDS.includes(band);

    if (!warnings.length && !bad) { skipped++; continue; }

    const place = s.town || s.state || "your area";
    let title, body;
    if (bad && !warnings.length) {
      title = "Air quality is unhealthy";
      body = `${place}: AQI ${Math.round(station.value)} ${band}. Limit outdoor activity.`;
    } else {
      const w = warnings.slice().sort((a, b) => String(b.severity).localeCompare(String(a.severity)))[0];
      title = w?.title || "Alerts in your area";
      body = `Active in ${place}${w ? `: ${w.title}` : ""}.`;
    }
    const payload = JSON.stringify({ title, body, url: "/#/", tag: `alert-${s.town || s.state}` });
    try {
      await webpush.sendNotification(s, payload, { TTL: 600 });
      sent++;
    } catch {
      failed++;
    }
  }
  console.log(`pushed ${sent}, skipped ${skipped}, failed ${failed}`);
} catch (e) {
  console.error("push error:", e.message);
  process.exit(1);
}
