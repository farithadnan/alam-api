# alam-api

Air-quality and environmental-hazards API for Malaysia: AQI (DOE APIMS), weather and
forecasts (Open-Meteo), the official MET Malaysia district forecast and warnings,
earthquakes (USGS), El Nino phase (NOAA ONI), and Malaysian news. Nationwide: 16 states,
68 air stations, 108 localities.

The dashboard (repo `alam-dashboard`) reads this API. Clients never talk to the upstreams
directly. The app is being moved to a **free, fully serverless Cloudflare stack** — a Worker
serves both the dashboard's static assets and the read API off one origin, with D1 for state.

## Stack

- **TypeScript** core (strict) — unchanged from the original Fastify app.
- **Cloudflare Worker** (`src/worker.js`) — `fetch` handler serving `src/store/d1-store.js`
  reads over **D1** (Cloudflare's serverless SQLite). Same single-origin contract the
  Fastify server had; the dashboard's `VITE_API_URL=""` works unchanged.
- **Static assets** — the built `alam-dashboard/dist` is served by the platform's `[assets]`
  block, so the SPA and `/api/*` share one origin.
- **D1** — state (observations, subscriptions, alert state). Migrations in `migrations/`
  (the original SQLite files, reused verbatim).
- **GitHub Actions** (planned, Phase 2-3) — drives ingestion and the alert cycle off the
  Worker, because free Workers are CPU-limited (10ms/invocation) and have no long-lived
  timers; heavy polling runs on the GH runner, which POSTs results back to the Worker.
- **Telegram Bot API** (planned, Phase 3) — webhook for inbound commands + an outbound
  `sendMessage` cycle (the old long-polling notifier does NOT run on serverless).
- **vitest** for tests.

> Migration status: **Phase 0 (read slice) is live** locally — `health`, `summary`, `hazards`
> over D1. Full read-route parity, the GH ingest runner, and the Telegram webhook notifier
> are the remaining phases (tracked in `~/.hermes/plans/2026-09-14_153405-serverless-cloudflare.md`).

## Architecture

```
src/
  worker.js         the Worker: static-asset SPA + /api/* route() dispatch (Phase 0 slice)
  store/d1-store.js the Store over D1 (same read contract the Fastify store had, async)
  store/migrations/ the original SQL migrations, now applied by wrangler to D1
  adapters/         one file per source, each implements `Adapter`; reused by the GH ingest runner
  core/             domain types, AQI bands, localities, states, districts (unchanged)
  http/             original Fastify server — kept until cutover, then removed
  scheduler.ts      original interval poller — being replaced by the GH Actions runner
  index.ts          original boot (store -> server -> scheduler) — kept until cutover
migrations/         wrangler D1 migration files (renamed copies of src/store/migrations/*.sql)
wrangler.toml       Worker + [assets] + D1 bindings; the two-mode dev/prod entry point
```

Two rules the code sticks to:

- **One adapter contract.** Every source normalises into `Observation`, so nothing
  downstream knows which source a row came from.
- **Reads come from the store, always.** No request handler calls an upstream. If a source
  is down, the last good data keeps serving.

## Two modes: local dev and production

Both modes run the **same code**; they differ only in bindings/config. This is the whole
point of the setup — promotion is a deploy, not a rewrite.

### Local development (100% local)

Everything runs on your machine — no cloud account, no cloud DB, nothing of prod is touched.

```bash
npm install
# build the dashboard once (or as needed): it serves the SPA in dev too
#   cd ../udara-dashboard && npm run build
# create the LOCAL D1 schema (matches the remote one)
npx wrangler d1 migrations apply DB --local
# local secrets (gitignored) go in .dev.vars, e.g.:
#   TELEGRAM_BOT_TOKEN=...
#   NEWSDATA_API_KEY=...
npx wrangler dev --port 8788        # SPA + /api/* + local D1 on one origin
```

Local D1 lives under `.wrangler/` (gitignored) — a real SQLite file fed by the same
migrations prod uses. Flagging a handler up mid-dev is just `npx wrangler dev` again;
wrangler hot-reloads.

To pull real data into the local DB during development, run the ingest runner against the
local origin once it exists (Phase 2), or seed rows by hand:

```bash
npx wrangler d1 execute DB --local --command "INSERT INTO observations (...) VALUES (...)"
```

Telegram webhook (Phase 3, optional in dev): Telegram only reaches a public HTTPS URL, so to
test the bot locally (or reach your local dev server from your phone) put a Cloudflare quick
tunnel in front of `wrangler dev`:

```bash
cloudflared tunnel --config /dev/null --url http://localhost:8788
```

> **Pitfall you WILL hit:** if `~/.cloudflared/config.yml` exists (this host's prod named
> tunnel does, with a catch-all `http_status:404`), plain `cloudflared tunnel --url …`
> silently loads that config, routes the quick-tunnel hostname through the PROD ingress, and
> the catch-all 404 swallows every request — the tunnel "works" but returns 404 with an
> empty body. The `--config /dev/null` forces a clean quick tunnel. A new random URL is
> minted each run: open it on your phone and, if testing the bot, re-`setWebhook` per session.

### Production (deploy)

Requires the Cloudflare credential — source `~/.cloudflared/wrangler.env` (a private
`CLOUDFLARE_API_TOKEN`; never commit it), or run `npx wrangler login`.

```bash
source ~/.cloudflared/wrangler.env      # or export CLOUDFLARE_API_TOKEN=...
npx wrangler d1 migrations apply DB --remote   # create the remote prod D1 schema
npx wrangler secret put TELEGRAM_BOT_TOKEN     # persisted Cloudflare-side, never in repo
# (repeat pour each secret: NEWSDATA_API_KEY, INGEST_SECRET, WEBHOOK_SECRET)
npx wrangler deploy                    # serves SPA + /api/*; D1 = remote `alam` DB
```

The Worker is published to a Workers zone/custom domain — at cutover the SPA + API move to
`app.oh-alam.my` (the current VPS + Cloudflare named tunnel keeps that domain until then).
Cloudflare-managed CI should build `alam-dashboard` and `wrangler deploy` on merge to `main`.

## API

`/api` is a self-describing index; `/v1` is an alias. Target rate limit: 120 requests/min
per IP (ported in Phase 1; the Fastify in-memory limiter is per-instance and does not carry
to a serverless edge).

| Route | Purpose | Status |
| --- | --- | --- |
| `GET /health` | liveness | ✅ live (Worker) |
| `GET /api` (or `/v1`) | endpoint index | ✅ live |
| `GET /api/summary?state=&town=&towns=` | one bundle for the dashboard, scoped | ✅ live (Worker+D1) |
| `GET /api/hazards` | earthquakes, climate, warnings | ✅ live |
| `GET /api/current?source=` | latest reading per station + band | ⏳ Phase 1 |
| `GET /api/history?source=&station=&hours=` | time series | ⏳ Phase 1 |
| `GET /api/forecast?state=` | model forecast | ⏳ Phase 1 |
| `GET /api/stations` | distinct sources/stations | ⏳ Phase 1 |
| `GET /api/flood` | current river + rain alerts | ⏳ Phase 1 |
| `GET /api/official` | MET district forecast | ⏳ Phase 1 |
| `/api/news` | recent Malaysian hazard news | ⏳ Phase 1 |

`/api/summary` is town-scoped on purpose: fetching every town's hourly and forecast series
cost 1.09 MB versus 133 KB scoped.

## Data strategy

Polling is owned by the GH Actions runner (replacing the old in-process scheduler). Each
adapter keeps its own interval, and the last poll is recorded in D1 `source_state` so a
missed run does not re-fetch everything still fresh.

| Source | Interval | Notes |
| --- | --- | --- |
| DOE APIMS air quality | 5 min | 16 state calls + the ArcGIS station layer |
| Open-Meteo weather + AQI | 30 min | 108 localities, weather + hourly + 7-day + US AQI + UV |
| USGS earthquakes | 10 min | 7-day SE-Asia feed, M4.5+ |
| MET warnings | 15 min | land warnings |
| MET district forecast | 6 h | 170 districts x 7 days, official text |
| News | 30 min | RSS + optional newsdata.io |
| NOAA ONI | 24 h | El Nino / La Nina phase |
| InfoBanjir flood + rain | 5 min | current-alert feed; stale/offline stations dropped |

Writes are append-only and idempotent (`INSERT OR IGNORE` on
`(source, station, measured_at, kind)`), which yields history for trends and resilience to
upstream blips. History is pruned (`pruneOlderThan`). **D1 free-tier cost guard:** the
CDN budgets 100k row-writes/day (enforced since Sep 2026) — ingestion should upsert latest
readings and keep history lean, both to stay free and to stay small.

## Notes

- DOE timestamps are Malaysia time (UTC+08) and stored as returned.
- **Two AQI scales collide.** Open-Meteo's `us_aqi` is the US 500-point scale; DOE is the
  Malaysia APIMS index. `aqiBand` classifies the Malaysian scale only.
- No free API exists for river/marine water quality, or MET observations (current
  conditions come from Open-Meteo).
- Net-new to serverless: no long-lived timers or sockets on the Worker; anything that
  "stays running" (ingest, alert cycles, Telegram long-poll) is either a GH-cron HTTP call
  or a webhook.
