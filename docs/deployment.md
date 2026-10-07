# Alam deployment runbook

Everything needed to go from "nothing is live" to the app served at `app.oh-alam.my` from
a free, fully serverless Cloudflare stack — a single Worker serves the dashboard SPA and
the `/api` from one origin, with D1 for state and GitHub Actions feeding data. **No VPS,
no Cloudflare tunnel, nothing hosted on a development PC.**

The deploy itself is automated by `.github/workflows/deploy.yml` (builds `alam-dashboard`
→ applies D1 migrations → syncs Worker secrets → `wrangler deploy`). This runbook is the
**one-time** manual setup on the GitHub + Cloudflare accounts, done once.

---

## 0. Order matters

Do it in this order:

1. Fine-grained PAT (unblocks CI)
2. GitHub secrets + variable
3. Cloudflare API token + account ID
4. D1 (verify it exists)
5. Custom domain (delete stale DNS first)
6. Trigger deploy and verify

---

## Step 1 — `ALAM_DASHBOARD_READ` PAT (unblocks the pipeline)

The deploy clones the **private** `alam-dashboard` repo to build it. The default token can't
read another private repo, so the workflow uses a fine-grained PAT. Without this, the first
deploy run fails at the dashboard checkout.

- Open https://github.com/settings/personal-access-tokens/new
- **Token name:** `alam-dashboard-read`
- **Expiration:** e.g. 30 days (or no expiration)
- **Repository access:** *Only select repositories* → **`alam-dashboard`** (not `alam-api`)
- **Permissions → Repository permissions → Contents:** **Read-only**
- **Generate token** → copy the `github_pat_…` value (shown once) → save it for Step 2.

## Step 2 — GitHub secrets & variable

In the `alam-api` repo → **Settings → Secrets and variables → Actions**:

**Secrets** (each via *New repository secret*):

| Secret | What it is / value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token from Step 3 |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (Step 4) |
| `ALAM_DASHBOARD_READ` | the `github_pat_…` from Step 1 |
| `INGEST_SECRET` | a long random string you invent (see note below) |
| `NEWSDATA_API_KEY` | *(optional)* newsdata.io key for the news adapter |
| `TELEGRAM_BOT_TOKEN` | *(optional)* Telegram bot token for alerts |
| `VITE_CARTO_KEY` | *(optional)* CARTO basemap key (inlined at dashboard build) |
| `VAPID_PUBLIC` / `VAPID_PRIVATE` | *(optional)* Web Push keypair used by `notify.yml` |

**Variable** (in the **Variables** tab, via *New repository variable*):

| Variable | Value |
|---|---|
| `INGEST_BASE` | the public origin the GH runner posts to: `https://app.oh-alam.my` (or the `*.workers.dev` URL until the custom domain is attached) |

**`INGEST_SECRET` note:** this one value is used in two places — the Worker validates the
`x-ingest-secret` header against it, and the GitHub runner sends it as that header.
`deploy.yml` writes the GitHub copy onto the Worker on every deploy, so they stay in sync
automatically. Pick one strong string and put it in the GitHub secret.

## Step 3 — Cloudflare API token

- Open https://dash.cloudflare.com/profile/api-tokens → **Create Token** → *Create Custom Token* → **Get started**
- **Token name:** `alam-deploy`
- **Permissions:** Account → **Worker Scripts → Edit**, **D1 → Edit**, **Account Settings → Read**
- **Account resources:** your main account
- **Continue to summary → Create token** → copy → store as `CLOUDFLARE_API_TOKEN` (shown once).

## Step 4 — Account ID

On https://dash.cloudflare.com the **Account ID** is shown on the right of any page (a hex
string). Store it as `CLOUDFLARE_ACCOUNT_ID`.

## Step 5 — D1 database

The `alam` D1 database already exists on the account; nothing to do. To confirm:

```bash
npx wrangler d1 list
```

It should show a row `alam` whose `uuid` equals the `database_id` in `wrangler.toml`
(currently `f23e188f-0e5d-44ac-a1d3-6a45aa5c747b`). If it is **not** there, create it once
and update `wrangler.toml`:

```bash
npx wrangler d1 create alam
```

Migrations are applied automatically by `deploy.yml` on every deploy.

## Step 6 — Custom domain (delete stale DNS first)

> **Pitfall:** the old VPS/tunnel left a DNS record for `app.oh-alam.my`. If you try to add
> the custom domain while it exists, Cloudflare refuses: *"Hostname 'app.oh-alam.my' already
> has externally managed DNS records."* Delete it first, then attach.

1. **dash.cloudflare.com → zone `oh-alam.my` → DNS → Records**
2. Delete the record(s) named `app` (an old **A** record to a VPS IP, and/or a **CNAME** to
   `*.cfargotunnel.com` from the retired named tunnel).
3. **Workers & Pages → `alam` → Settings → Domains & Routes → Add custom domain** → `app.oh-alam.my`
   → Cloudflare creates its own routing record and verifies (up to a minute).

If it still conflicts, there may be a second `app`-named record or a registrar-side `.my`
record to clear.

## Step 7 — Trigger deploy & verify

- Open the `alam-api` repo → **Actions** → **deploy** → **Run workflow**, or push to `main`.
- The run must be **green** (if it's red, the usual first cause is a missing
  `ALAM_DASHBOARD_READ` secret).
- Verify: open `https://app.oh-alam.my/health` and `/api/summary` (or the `*.workers.dev`
  URL until the domain is attached). Within minutes the `ingest` workflow (5-min cron) feeds
  data from the weather/AQI/quake/news sources.

---

## Old host teardown (already retired)

The previous self-hosted setup — a VPS running the Fastify app behind a Cloudflare named
tunnel serving `app.oh-alam.my` — is gone and is **not** required anymore:

- No `cloudflared` tunnel / named-tunnel config is needed.
- No VPS box, no `domain-flip.sh` between Worker and VPS.
- The dashboard is **not** served from Cloudflare Pages anymore; the Worker serves both
  the SPA and the API (`[assets]` in `wrangler.toml`, `../alam-dashboard/dist`).

Relevant stale artifacts that should stay removed: the dashboard `functions/` Pages proxy,
the dashboard `publish.yml`, and any `udara-dashboard`-named paths (renamed to
`alam-dashboard`).