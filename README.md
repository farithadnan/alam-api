# alam-api

Air-quality and environmental-hazards **ingest + read API** for Malaysia: AQI
(DOE APIMS), weather and forecasts (Open-Meteo), the official MET Malaysia
district forecast and warnings, earthquakes (USGS), El Nino phase (NOAA ONI), and
Malaysian news. Nationwide: 16 states, 68 air stations, 108 localities.

The dashboard (repo: `alam-dashboard`) reads this API. Clients never talk to the
upstreams directly.

## Stack

- **Node 24 + TypeScript** (strict). `node:sqlite` requires Node 22.5+.
- **Fastify** HTTP API (+ `@fastify/cors`)
- **zod** for config and validation
- **`node:sqlite`** (native, zero dependency) snapshot store
- native `fetch`, wrapped in one retry/politeness layer
- **vitest** for tests (53, all offline except the drift check)

## Architecture

```
src/
  adapters/   one file per source, each implements `Adapter`; add a source = add one file
  core/       domain types, AQI bands, localities, states,
              metDistricts (170 MET districts + their states),
              townDistricts (resolves a town to its district)
  store/      schema, versioned migrations, the only place SQL lives
  http/       Fastify routes, the only place HTTP concerns live
  util/       config, text, fetch layer
  scheduler.ts  interval polling + freshness bookkeeping
  cli.ts        one-shot ingest (tests, cron, local refresh)
  index.ts      boot: store -> server -> scheduler -> graceful shutdown
```

Two rules the code sticks to:

- **One adapter contract.** Every source normalises into `Observation`, so nothing
  downstream knows which source a row came from.
- **Reads come from SQLite, always.** No request handler calls an upstream. If a
  source is down, the last good data keeps serving.

## Data strategy

Polling is owned solely by the scheduler. Each adapter has its own interval and its
last poll is recorded in SQLite, so a restart does not re-fetch anything still fresh.

| Source | Interval | Notes |
| --- | --- | --- |
| DOE APIMS air quality | 5 min | 16 state calls + the ArcGIS station layer (exact coords, category, PM10) |
| Open-Meteo weather + AQI | 30 min | 108 localities, weather + hourly + 7-day + US AQI + UV |
| USGS earthquakes | 10 min | 7-day SE-Asia feed, M4.5+ |
| MET warnings | 15 min | land warnings |
| MET district forecast | 6 h | 170 districts x 7 days, official text |
| News | 30 min | RSS (Free Malaysia Today, NST, Utusan) + optional newsdata.io |
| NOAA ONI | 24 h | El Nino / La Nina phase |

Writes are append-only and idempotent (`UNIQUE(source, station, measured_at, kind)`
with `INSERT OR IGNORE`), which yields history for trends, resilience to upstream
blips, and low load on free third-party APIs. History is pruned after 90 days.

The MET district registry and the town crosswalk are **reference data in SQLite**
(`migrations/003_town_districts.sql`), not generated files. Rows whose town name
already matches the district are derived at read time; only genuine exceptions
(a city named differently from its district) are stored, each with a source and an
asserted date.

## Upstream politeness

All upstream calls go through one layer (`src/util/http.ts`) that:

- retries only transient failures (network, timeout, 408/425/429/5xx); other 4xx fail fast
- honours `Retry-After` on 429
- backs off exponentially with full jitter, so adapters do not retry in lockstep
- serialises calls per host with a minimum gap, so no adapter can burst
- sends a descriptive User-Agent

This matters: these are free public APIs and the honest way to use them is to not
hammer them.

## Run

```bash
npm install
cp .env.example .env
npm run dev                 # server + scheduler
npm run ingest              # one-shot, respects intervals
npm run ingest -- --force   # ignore intervals, re-poll everything
npm test
npm run typecheck
npm run check:drift         # registry vs the live MET feed
```

## API

`/api` is a self-describing index; `/v1` is an alias. Rate limit: 120 requests/min
per IP, with `x-ratelimit-*` headers.

| Route | Purpose |
| --- | --- |
| `GET /health` | liveness |
| `GET /api` (or `/v1`) | endpoint index |
| `GET /api/current?source=doe-eqms` | latest reading per station + band |
| `GET /api/history?source=&station=&hours=` | time series |
| `GET /api/forecast?state=` | model forecast |
| `GET /api/stations` | distinct sources/stations |
| `GET /api/hazards` | earthquakes, climate, warnings |
| `GET /api/summary?state=&town=&towns=` | one bundle for the dashboard, scoped to a town |
| `GET /api/official?state=&town=&district=` | MET district forecast; `town` resolves the district for you |
| `GET /api/news` | recent Malaysian weather/hazard news |

`/api/summary` is town-scoped on purpose: fetching every town's hourly and forecast
series cost 1.09 MB, versus 133 KB scoped.

## Keeping it running

The process died silently once: no error in its own log, just gone, which means stale
data and (once alerts exist) no alerts at all. `scripts/watchdog.sh` health-checks it
and restarts it when it is not answering. Installed on the host as:

```
*/2 * * * * /home/synthsloth/projects/udara-api/scripts/watchdog.sh
@reboot sleep 20 && /home/synthsloth/projects/udara-api/scripts/watchdog.sh
```

It runs as a user cron job, so it needs no root, and it logs every restart to
`data/watchdog.log`. A user-level systemd unit would be tidier where available.

## Tests and quality gates

- `ci.yml` runs typecheck + tests on push and pull request.
- `drift.yml` runs `check:drift` nightly: it compares the district registry and the
  town crosswalk against the live MET feed and fails on drift (exit 1) or on being
  unable to check (exit 2, so a rate-limited feed never looks like success).
- Tests enforce referential integrity: every locality must resolve to a district in
  its own state, or the suite fails.

## Notes

- DOE timestamps are Malaysia time (UTC+08) and stored as returned.
- **Two AQI scales collide.** Open-Meteo's `us_aqi` is the US 500-point scale; DOE is
  the Malaysia APIMS index. `aqiBand` classifies the Malaysian scale only, so US AQI
  must never be labelled with Malaysian bands.
- No free API exists for river or marine water quality, or for MET observations
  (current conditions come from Open-Meteo).
- Portable by design: runs on any Node host or a cron runner, so nothing depends on
  the current VPS.
