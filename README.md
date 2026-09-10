# alam-api

Air-quality & environmental-hazards **ingest + read API** for Malaysia, Johor first.
A `solat.my`-style dashboard (repo: `udara-dashboard`) reads this API for a clean view of what the official APIMS site shows awkwardly.

## Stack

- **Node 24 + TypeScript** (strict)
- **Fastify** HTTP API (+ `@fastify/cors`)
- **zod** — config + validation
- **`node:sqlite`** (native, zero-dep) — polled snapshot store
- native `fetch` with timeout + exponential-backoff retries
- **vitest** — unit tests

## Architecture (clean, layered)

```
src/
  adapters/   one file per data source, each implements `Adapter`  (Open/Closed: add a source = add one file)
  core/       domain types + AQI band logic (pure, no I/O)
  store/      sqlite schema + versioned migrations + repository (the only place SQL lives)
  http/       Fastify routes (the only place HTTP concerns live)
  util/       config (zod), fetch-with-retry
  scheduler.ts  polls adapters -> ingest -> store, on staggered intervals
  cli.ts        one-shot ingest (for cron/tests)
  index.ts      boot: store -> server -> scheduler -> graceful shutdown

test/           vitest suites mirrored under core/, adapters/, store/ (offline, mock fetch)
```

- **Data fetching**: every source produces normalized `Observation`s through one `Adapter` contract — DRY, and the rest of the system never knows a specific source exists.
- **Data management**: we **store** polled snapshots. The store is append-only and idempotent
  (`UNIQUE(source, station, measured_at)` + `INSERT OR IGNORE`), which gives us history/trends,
  resilience (serve last-known if an upstream blips), and keeps third-party API load low.
  Reads always come from SQLite. History is pruned after 90 days.

## Run

```bash
npm install
cp .env.example .env        # tweak ports/poll intervals
npm run dev                 # server + scheduler
npm run ingest              # one-shot ingest, prints current stations
npm test
```

### API

| Route | Purpose |
| --- | --- |
| `GET /health` | liveness |
| `GET /api/stations` | distinct sources/stations |
| `GET /api/current?source=doe-eqms` | latest reading per station + AQI band |
| `GET /api/history?source=&station=&hours=` | time series |
| `GET /api/hazards` | earthquakes + climate (coming) |

## Status / roadmap

Done:
- [x] Skeleton, streaming zero-dep store, Fastify read API, scheduler
- [x] **doe-eqms** adapter — Malaysia DOE APIMS, real-time per-station AQI, Johor (stateid 1)

Issues queue (implemented as issues on the repos):
- [ ] **open-meteo** adapter — weather (temp/humidity/wind/precip) + air quality + UV (free, no key)
- [ ] **usgs-eq** adapter — SE-Asia earthquake feed
- [ ] **oni** adapter — El Niño / La Niña phase (parsed NOAA index)
- [x] Real HTTP/data tests + a migration strategy (proper schema versioning)
- [ ] `/api/hazards` responses wired to stored quake + climate data
- [ ] `udara-dashboard` frontend repo (mobile-first, list-based)
- [ ] `udara-notifier` (Telegram) — Unhealthy-AQI + quake/tsunami push alerts

## Notes

- DOE `eqms` returns timestamps in **Malaysia local time (UTC+08)**; stored as returned.
- **Two different AQI scales collide**: Open-Meteo's `us_aqi` is the US 500-pt scale, while DOE `eqms` is the Malaysia APIMS index (different ranges/bands). The `aqiBand` helper classifies the **Malaysia** scale — the dashboard must not apply the Malaysian bands to Open-Meteo's US AQI without relabeling or converting.
- Old blog note: this service is portable — runs on GitHub Actions (cron) or any Node host,
  so the 1-month VPS tryout doesn't lock it in.