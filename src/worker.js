/**
 * Alam — Cloudflare Worker (single origin: SPA static assets + the read API).
 *
 * The dashboard build (../udara-dashboard/dist) is served by the platform as static
 * assets ([assets] in wrangler.toml); requests that do NOT match a file (i.e. /api/*,
 * /health, unknown routes) land here. One origin for the SPA and the API, exactly as the
 * VPS Fastify app served them, so the dashboard's `VITE_API_URL=""` (same-origin) works
 * unchanged.
 *
 * This is full read parity with src/http/server.ts (summary, current, history, forecast,
 * stations, hazards, official, news, haze, flood + /v1 alias) over D1. Heavy ingestion
 * runs off-Worker (workflows/ingest.mjs -> /_internal/ingest) because free Worker CPU is
 * 10ms.
 */
import { D1Store } from "./store/d1-store.js";
import { TelegramClient } from "./bot/telegram.js";
import { handleMessage } from "./bot/commands.js";
import { runCycle, quietActive } from "./bot/notifier.js";
import { aqiBand } from "./core/bands.js";
import { groupWarnings } from "./core/warnings.js";
import { MALAYSIA_LOCALITIES } from "./core/localities.js";
import { MALAYSIA_STATES } from "./core/states.js";
import { districtFor } from "./core/townDistricts.js";
import { MY_OFFSET_MS, LATEST_LIMIT, NEWS_LIMIT, QUAKE_LIMIT } from "./core/constants.js";
import { WHO_PM25_24H } from "./core/haze.js";

const decorate = (o) =>
  o.kind === "aqi" && o.source === "doe-eqms" ? { ...o, band: aqiBand(o.value) } : o;

const quakeView = (q) => ({ source: q.source, station: q.station, stationName: q.stationName, measuredAt: q.measuredAt, magnitude: q.value, meta: q.meta ?? null });
const warningView = (w) => ({ source: w.source, station: w.station, title: w.stationName, severity: w.value, measuredAt: w.measuredAt, meta: w.meta ?? null });

const stateOf = (v) => {
  const n = String(v ?? "").trim().toLowerCase();
  const ALIAS = {
    penang: "Pulau Pinang", "pulau pinang": "Pulau Pinang", "kuala lumpur": "WP Kuala Lumpur",
    kl: "WP Kuala Lumpur", labuan: "WP Labuan", "ft labuan": "WP Labuan", putrajaya: "WP Putrajaya",
    "ft putrajaya": "WP Putrajaya", "wp kuala lumpur": "WP Kuala Lumpur", malacca: "Melaka",
    "n. sembilan": "Negeri Sembilan", "negeri sembilan": "Negeri Sembilan",
  };
  const hit = MALAYSIA_STATES.find((s) => s.name.toLowerCase() === n);
  return hit?.name ?? ALIAS[n] ?? v;
};

/** Approximate a station's position: known locality, else state centroid. */
function stationCoords(name, stateName) {
  const slug = (s) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const n = slug(name);
  const hit = MALAYSIA_LOCALITIES.find((l) => slug(l.name) === n)
    || MALAYSIA_LOCALITIES.find((l) => l.slug === n)
    || MALAYSIA_LOCALITIES.find((l) => slug(l.name).includes(n) || n.includes(slug(l.name)));
  if (hit) return { lat: hit.lat, lon: hit.lon };
  if (stateName) {
    const st = MALAYSIA_LOCALITIES.filter((l) => l.state === stateName);
    if (st.length) return { lat: st.reduce((a, l) => a + l.lat, 0) / st.length, lon: st.reduce((a, l) => a + l.lon, 0) / st.length };
  }
  return null;
}

const apiIndex = () => ({
  name: "Alam API",
  version: "v1",
  note: "Free, public, no key. Please cache; data refreshes every few minutes.",
  endpoints: [
    "/api/summary", "/api/current", "/api/history", "/api/forecast", "/api/stations",
    "/api/hazards", "/api/flood", "/api/news", "/api/official", "/api/haze",
  ],
  alias: "/v1/* mirrors /api/*",
});

const json = (body, status = 200, cache = "") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(cache ? { "cache-control": cache } : {}),
    },
  });

const log = (msg) => console.log("[bot] " + msg);

/**
 * Serve a static asset through the Worker so we can set per-file cache control.
 * index.html (and the SPA fallback for deep-link paths) is sent no-cache — it must
 * always revalidate, otherwise the browser can hold old HTML that points at pruned
 * hashed bundles (404 until a hard refresh). Everything else (hashed /assets/*,
 * manifest, icons, sw) is immutable: its filename changes per build.
 */
function withCache(resp, cc) {
  const headers = new Headers(resp.headers);
  headers.set("Cache-Control", cc);
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}
async function serveAssets(request, env) {
  const url = new URL(request.url);
  const resp = await env.ASSETS.fetch(request);
  if (resp.status === 404) {
    // SPA fallback: a path with no matching file is the app shell (hash routing means
    // deep links live under #/, so this is rare but must never 404 the SPA itself).
    const html = await env.ASSETS.fetch(`${url.origin}/index.html`);
    return withCache(html, "no-cache");
  }
  const isHtml = url.pathname === "/" || /(^|\/)index\.html?$/.test(url.pathname);
  return withCache(resp, isHtml ? "no-cache" : "public, max-age=31536000, immutable");
}

async function route(method, path, params, env) {
  const store = new D1Store(env.DB);
  if (method !== "GET") return json({ error: "method_not_allowed" }, 405);

  // Normalise /v1 -> /api, strip prefix + trailing slash.
  let api = path.replace(/^\/v1/, "/api").replace(/^\/api\/?/, "").replace(/\/$/, "");
  if (api === "health") return json({ ok: true, t: new Date().toISOString() });
  if (api === "" || api === "api") return json(apiIndex());

  const q = (k) => params.get(k) ?? "";
  const newsRows = (rows, limit) => {
    const seen = new Set(); const out = [];
    for (const n of rows) {
      const u = n.meta?.url ?? null;
      if (u && seen.has(u)) continue;
      if (u) seen.add(u);
      out.push({ title: n.stationName, url: u, outlet: n.meta?.outlet ?? null, publishedAt: n.measuredAt });
      if (out.length >= limit) break;
    }
    return out;
  };

  if (api === "summary") {
    const state = q("state");
    const wanted = new Set([q("town"), ...q("towns").split(",")].map((t) => t.trim()).filter(Boolean));
    const inState = (rows) => (state ? rows.filter((r) => r.meta?.state === state) : rows);
    const byTown = (rows) => (wanted.size ? rows.filter((r) => wanted.has(r.station)) : []);
    const since24 = new Date(Date.now() + MY_OFFSET_MS - 24 * 3_600_000).toISOString().slice(0, 19);
    const [aqi, weather, earthquakes, warnings, news, climate, allForecast, hourlyForForecast] = await Promise.all([
      store.latestBySource("doe-eqms").then((r) => inState(r.map(decorate))),
      store.latestBySource("open-meteo").then((r) => inState(r.filter((x) => x.kind !== "haze"))),
      store.latestByKind("quake", QUAKE_LIMIT).then((rs) => rs.map(quakeView)),
      store.latestByKind("warning", LATEST_LIMIT).then((rs) => groupWarnings(rs.map(warningView))),
      store.latestByKind("news", NEWS_LIMIT * 3).then((rows) => newsRows(rows, NEWS_LIMIT)),
      store.latestBySource("oni").then((r) => r[0] ?? null),
      store.forecast("open-meteo"),
      store.hourly("open-meteo"),
    ]);
    const stations = await Promise.all(aqi.map(async (s) => ({
      ...s,
      coords: s.meta?.lat != null && s.meta?.lon != null ? { lat: s.meta.lat, lon: s.meta.lon } : stationCoords(String(s.stationName), s.meta?.state),
      trend: (await store.history("doe-eqms", s.station, since24)).map((r) => r.value),
    })));
    const weatherOut = weather.map((r) => {
      const loc = MALAYSIA_LOCALITIES.find((l) => l.slug === r.station);
      return { ...r, coords: loc ? { lat: loc.lat, lon: loc.lon } : null };
    });
    const allTowns = MALAYSIA_LOCALITIES.map((l) => ({ station: l.slug, name: l.name, state: l.state }));
    return json(
      {
        states: [...new Set([...aqi, ...weather].map((r) => r.meta?.state).filter(Boolean))],
        allTowns, stations,
        weather: weatherOut,
        forecast: byTown(inState(allForecast)),
        hourly: byTown(inState(hourlyForForecast)),
        news,
        hazards: { warnings, earthquakes, climate },
        ts: new Date().toISOString(),
      },
      200, "public, max-age=120, stale-while-revalidate=600",
    );
  }

  if (api === "current") return json({ source: q("source") || "doe-eqms", current: (await store.latestBySource(q("source") || "doe-eqms")).map(decorate) });

  if (api === "history") {
    const source = q("source") || "doe-eqms";
    if (!q("station")) return json({ error: "missing `station`" });
    const hours = Math.min(Math.max(Number(q("hours") || 24) || 24, 1), 24 * 14);
    const since = new Date(Date.now() + MY_OFFSET_MS - hours * 3_600_000).toISOString().slice(0, 19);
    return json({ history: await store.history(source, q("station"), since) });
  }

  if (api === "forecast") return json({ forecast: await store.forecast(q("source") || "open-meteo") });

  if (api === "stations") return json({ stations: await store.stations() });

  if (api === "hazards") {
    const [earthquakes, climate, warnings] = await Promise.all([
      store.latestByKind("quake", QUAKE_LIMIT).then((rs) => rs.map(quakeView)),
      store.latestBySource("oni").then((r) => r[0] ?? null),
      store.latestByKind("warning", LATEST_LIMIT).then((rs) => groupWarnings(rs.map(warningView))),
    ]);
    return json({ earthquakes, climate, warnings, timestamp: new Date().toISOString() });
  }

  if (api === "news") return json({ news: newsRows(await store.latestByKind("news", 30), 30) });

  if (api === "official") {
    const state = q("state") ? stateOf(q("state")) : null;
    const townDistrict = q("town") ? districtFor(q("town"), await store.townDistrict(q("town"))) : null;
    const rows = (await store.metForecast()).map((r) => ({
      district: r.stationName, state: r.meta?.state ?? null, date: r.measuredAt.slice(0, 10),
      summary: r.meta?.summary ?? null, when: r.meta?.when ?? null,
      tmin: r.meta?.tmin ?? null, tmax: r.meta?.tmax ?? null,
    }));
    const filtered = rows.filter((r) =>
      (!state || r.state === state) && (!townDistrict || r.district === townDistrict) && (!q("district") || r.district.toLowerCase() === q("district").toLowerCase()));
    return json({ district: townDistrict ?? q("district") ?? null, official: filtered, districts: [...new Set(rows.map((r) => r.district))] });
  }

  if (api === "haze") {
    const rows = q("town") ? await store.hazeFor(q("town")) : await store.latestByKind("haze", 600);
    const scoped = q("state") ? rows.filter((r) => r.meta?.state === q("state")) : rows;
    return json({
      town: q("town") ?? null,
      haze: scoped.map((r) => ({ date: r.measuredAt.slice(0, 10), pm25Max: r.value, pm25Avg: r.meta?.avg ?? null, aboveGuideline: r.value > WHO_PM25_24H })),
    });
  }

  if (api === "flood") {
    const scope = (rows) => (q("state") ? rows.filter((r) => r.meta?.state === q("state")) : rows);
    const rank = { Danger: 0, Warning: 1, Alert: 2, Moderate: 3, Heavy: 3 };
    const worst = (rows) => {
      const seen = new Map();
      for (const r of rows) {
        const cur = seen.get(r.station);
        const rk = rank[r.meta?.severity] ?? 9;
        if (!cur || rk < (rank[cur.meta?.severity] ?? 9)) seen.set(r.station, r);
      }
      return [...seen.values()];
    };
    const [flood, rainfall] = await Promise.all([
      store.latestByKind("flood").then(scope),
      store.latestByKind("rainfall").then(scope),
    ]);
    const river = worst(flood).map((r) => ({
      station: r.station, stationName: r.stationName, state: r.meta?.state, district: r.meta?.district,
      basin: r.meta?.basin, level: r.value, severity: r.meta?.severity, trend: r.meta?.trend,
      lat: r.meta?.lat ?? null, lon: r.meta?.lon ?? null, at: r.measuredAt,
    }));
    const rain = worst(rainfall).map((r) => ({
      station: r.station, stationName: r.stationName, state: r.meta?.state, district: r.meta?.district,
      mmHour: r.value, severity: r.meta?.severity, lat: r.meta?.lat ?? null, lon: r.meta?.lon ?? null, at: r.measuredAt,
    }));
    return json({ river, rain, timestamp: new Date().toISOString() });
  }

  return json({ error: "not_found", path }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (path === "/health") return json({ ok: true, t: new Date().toISOString() });

    if (path.startsWith("/_internal")) {
      const given = request.headers.get("X-Ingest-Secret") ?? "";
      if (!env.INGEST_SECRET || given !== env.INGEST_SECRET) return json({ error: "unauthorized" }, 401);
      const store = new D1Store(env.DB);
      if (path === "/_internal/source" && request.method === "GET") {
        const id = url.searchParams.get("adapterId") || "";
        const intervalMs = Number(url.searchParams.get("intervalMs") || 0);
        const st = await store.sourceState(id);
        return json({ adapterId: id, lastPolledAt: st.lastPollledAt, lastOkAt: st.lastOkAt, stale: await store.isStale(id, intervalMs) });
      }
      if (path === "/_internal/ingest" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!body || !Array.isArray(body.rows)) return json({ error: "bad_request" }, 400);
        const inserted = await store.ingest(body.rows);
        await store.recordPoll(String(body.adapterId ?? ""), inserted);
        return json({ adapterId: body.adapterId ?? "", inserted });
      }
      if (path === "/_internal/prune" && request.method === "POST") {
        return json({ pruned: await store.pruneOlderThan(Number(url.searchParams.get("days") || 90)) });
      }
      if (path === "/_internal/notify" && (request.method === "GET" || request.method === "POST")) {
        if (!env.TELEGRAM_BOT_TOKEN) return json({ ok: true, note: "no TELEGRAM_BOT_TOKEN" });
        if (quietActive(Date.now(), Number(env.QUIET_START ?? 23), Number(env.QUIET_END ?? 7))) return json({ ok: true, skipped: "quiet" });
        const client = new TelegramClient(env.TELEGRAM_BOT_TOKEN, log);
        const url = env.SITE_URL || "https://app.oh-alam.my";
        const result = await runCycle(client, store, url, log).catch((e) => ({ error: e.message }));
        return json({ ok: true, result });
      }
      return json({ error: "not_found", path }, 404);
    }

    // ---- Telegram webhook (inbound commands) ----
    if (path === "/telegram/webhook" && request.method === "POST") {
      const expected = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
      if (!env.TELEGRAM_WEBHOOK_SECRET || expected !== env.TELEGRAM_WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401);
      const update = await request.json().catch(() => null);
      const chatId = update?.message?.chat?.id;
      const text = update?.message?.text;
      if (typeof chatId === "number" && typeof text === "string" && env.TELEGRAM_BOT_TOKEN) {
        const store = new D1Store(env.DB);
        const client = new TelegramClient(env.TELEGRAM_BOT_TOKEN, log);
        const reply = handleMessage({ store }, chatId, text);
        if (reply) await client.sendMessage(chatId, reply).catch(() => {});
      }
      return json({ ok: true });
    }

    // ---- Static assets (SPA) — served through the Worker for correct cache headers.
    if ((request.method === "GET" || request.method === "HEAD") && !path.startsWith("/api") && !path.startsWith("/v1") && path !== "/health") {
      return serveAssets(request, env);
    }

    return route(request.method, path, url.searchParams, env);
  },
};
