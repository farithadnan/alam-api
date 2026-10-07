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
  worker.js         the Worker: static-asset SPA + /api/* route() dispatch
  index.ts          VPS boot: store -> Fastify server -> scheduler -> notifier
  scheduler.ts      VPS interval poller
  http/server.ts    VPS Fastify server (same read contract as the Worker)
  store/queries.js  shared SQL + snake_case→camelCase row mappers (one source for both stores)
  store/db.ts       Store over node:sqlite (VPS), synchronous
  store/d1-store.js Store over Cloudflare D1 (Worker), async — same method set
  adapters/         one file per source, each implements `Adapter`
  core/             domain logic: types, AQI bands, localities, states, districts, warnings, messages
  bot/              Telegram commands, edge-trigger engine, notifier, resolve
  util/             config, http, text helpers
migrations/         the single SQL migration set; applied by wrangler (D1) and node:sqlite (VPS)
wrangler.toml       Worker + [assets] + D1 bindings; the two-mode dev/prod entry point
```

Two rules the code sticks to:

- **One adapter contract.** Every source normalises into `Observation`, so nothing
  downstream knows which source a row came from.
- **One store contract, one SQL source.** Both stores expose the same methods; the SQL
  and row mapping live once in `store/queries.js`, so VPS and Worker can't drift.
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
#   cd ../alam-dashboard && npm run build
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

The single-origin deploy is fully automated by GitHub Actions (`.github/workflows/deploy.yml`):
on push to `main` it builds `alam-dashboard` into `dist/`, applies the remote D1 migrations,
and `wrangler deploy`s one Worker that serves **both** the SPA and `/api/*` off the same
origin. Nothing runs on a VPS or a development PC — the Fastify host and the Cloudflare
tunnel are gone.

The only manual steps are on the Cloudflare account, the first time:

1. **Set repo secrets** (in the `alam-api` repo → Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN` — a token scoped to `Workers Scripts: Edit`, `D1: Edit`.
   - `CLOUDFLARE_ACCOUNT_ID` — visible on the right of any Cloudflare zone dashboard.
2. **Create the remote D1 DB once** if it does not exist yet:
   `npx wrangler d1 create alam` and paste the returned `database_id` into `wrangler.toml`
   (currently hard-coded to `f23e188f-0e5d-44ac-a1d3-6a45aa5c747b`).
3. **Service secrets** are sent by the GH runners, never stored on any host: `INGEST_SECRET`
   (see `workflows/ingest.mjs` / `notify.yml`), `NEWSDATA_API_KEY`, `TELEGRAM_BOT_TOKEN`,
   and `VAPID_PUBLIC`/`VAPID_PRIVATE` (Web Push) — set as repo secrets/variables.
4. **Custom domain** — attach `app.oh-alam.my` to the Worker (Workers → `alam` → Settings →
   Domains & Routes → Add custom domain). It also gets a free `*.workers.dev` URL for
   immediate access.

Then push to `main` and the Worker is live at `app.oh-alam.my`.

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
