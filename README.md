# OhAlam — the data behind the dashboard

This is the "brain" of OhAlam, the Malaysia air-quality and environmental-hazards site
at **https://app.oh-alam.my**.

It fetches air quality, weather, earthquake, flood, and hazard-news data from a handful of
free public sources, tidies it up into one simple format, and serves it to the website.
The website (the `alam-dashboard` repo) only ever talks to this — it never calls those
sources directly.

Sources it pulls from:

| Data | Source |
| --- | --- |
| Air quality (AQI) | DOE / Malaysia APIMS |
| Weather + forecast | Open-Meteo |
| Earthquakes | USGS |
| Official MET district forecast & warnings | MET Malaysia |
| Flood & rain alerts | InfoBanjir |
| El Niño / La Niña phase | NOAA |
| Hazard news | Malaysian news + newsdata.io |

---

## How it keeps working (plain English)

- Where it runs: **free on Cloudflare** (sends your phone a read-only copy of the data).
- How the data stays fresh: a background job on GitHub checks the sources every few minutes
  for new readings and stores them. You don't need a server for this.
- What if a source goes down: the website keeps showing the last known good data — it never
  breaks because one feed is unreachable.

So there is **no server to rent, no tunnel, nothing running on your computer.**

---

## Run it on your machine (for development)

You need [Node.js](https://nodejs.org) installed.

```bash
# 1. Install the tools
npm install

# 2. Set up the local database (kept only on your machine)
npx wrangler d1 migrations apply DB --local

# 3. Start the local API + website together at http://localhost:8788
npx wrangler dev --port 8788
```

That's it — the API opens at `http://localhost:8788/api`, and if you built the website
(see the `alam-dashboard` README) it's served too.

Other handy commands:

```bash
npm test                # run the automated checks
npm run typecheck       # check for mistakes in the code
npm run ingest          # fetch data into the local database manually, once
```

Private settings for local development (like an API key) go in a file named `.dev.vars`
(copy the example values, never commit this file).

---

## Putting it live

Publishing is automatic. When you push to the `main` branch of this repo, a GitHub
workflow:

1. Builds the website,
2. Sets up the database,
3. Publishes the whole thing to Cloudflare at your custom domain, `app.oh-alam.my`.

The only manual step is done **once**: add a Cloudflare API token and account ID, plus a
fine-grained GitHub token that can read the dashboard repo, as repository secrets. Then push
to `main` and the workflow builds the website, sets up the database, and publishes everything
to Cloudflare automatically.

---

## The API (you usually won't call it directly)

The website reads a few endpoints like `/api/summary`. They start with `/api` (or `/v1`),
and a `GET /api` page lists them all if you ever want to poke around:
`https://app.oh-alam.my/api`.

---

## For developers (short notes)

- The code is shared between two worlds: a Cloudflare Worker (`src/worker.js`) for the
  website, and an older server version (`src/http`, `src/index.ts`) kept for one-off tools.
- Both use the same database code, so they can't drift apart.
- Types are in TypeScript, tests use vitest, and `migrations/` holds the database setup —
  the exact same file works locally and on Cloudflare.