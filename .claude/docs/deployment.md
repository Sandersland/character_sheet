# Deployment

How this app is packaged for hosting, and the runbook for the **dev** environment
(Railway behind Cloudflare Access). **Prod is intentionally not deployed yet** —
the app has no in-app auth and characters are globally editable, so a public prod
environment must wait until authentication + character ownership exist.

## Packaging model

Components are env-driven so any of them can be deployed anywhere:

| Image | File | Use |
|---|---|---|
| Combined single-origin | `Dockerfile` (repo root) | API serves the built SPA on one origin. Used by Railway dev and `docker-compose.prod.yml`. |
| Backend (API-only) | `backend/Dockerfile.prod` | Split deploys where the frontend is hosted separately. |
| Frontend (nginx static) | `frontend/Dockerfile.prod` | Split deploys; serves `dist/` with SPA fallback. |

### Environment variables

| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | backend | Postgres connection string. Required. |
| `PORT` | backend | Listen port (default 4000). Railway injects its own. |
| `SERVE_STATIC_DIR` | backend | When set, the API serves the SPA from this dir (single-origin). Combined image sets `/app/public`. Unset → API-only. |
| `CORS_ORIGIN` | backend | Comma-separated allowlist. Empty → reflect the request origin (fine for single-origin/local). Set for split mode. CORS always sends `Access-Control-Allow-Credentials: true` (the SPA sends the session cookie), so the origin is always a concrete value, never `*` — set the allowlist explicitly to harden a split-origin prod. |
| `LOG_LEVEL` | backend | Pino log level (`fatal`…`trace`, or `silent`). Default `info`; tests run `silent`. JSON output in prod, pretty in dev. |
| `RATE_LIMIT_WINDOW_MS` | backend | Rate-limit window in ms. Default `900000` (15 min). |
| `RATE_LIMIT_MAX` | backend | Max requests per window per IP, global. Default `600`. |
| `RATE_LIMIT_CREATE_MAX` | backend | Tighter cap for `POST /api/characters` per window. Default `30`. |
| `RATE_LIMIT_DISABLED` | backend | `true` disables rate limiting entirely (also auto-off under test). |
| `APP_BASE_URL` | backend | Public origin of the API, used to build the OAuth redirect URI. Default `http://localhost:4000`. Set to the deployed origin in prod. |
| `GOOGLE_CLIENT_ID` | backend | Google OAuth client id. Optional — Google sign-in is enabled only when **both** id and secret are set; absent → the app boots with no providers. |
| `GOOGLE_CLIENT_SECRET` | backend | Google OAuth client secret. See above; both must be set together. |
| `SESSION_COOKIE_SECURE` | backend | Whether session/oauth cookies get the `Secure` flag. Tri-state: defaults to on in production, off elsewhere; set `true`/`false` to override (e.g. force off behind a local proxy). |
| `VITE_API_URL` | frontend **build** | Baked at build time. `/api` for single-origin; the API's absolute URL for split. |

**OAuth setup:** register the redirect URI `${APP_BASE_URL}/api/auth/google/callback`
(e.g. `http://localhost:4000/api/auth/google/callback` in dev) as an authorized
redirect URI on the Google OAuth client. A provider appears in
`GET /api/auth/providers` and is usable only when its id+secret pair is set.

The single-origin design is deliberate: one hostname means one Cloudflare Access
policy, same-origin `fetch` (no CORS), and no cross-origin Access-cookie problems.

### Security headers & rate limiting

The backend applies `helmet` (HSTS, `nosniff`, `X-Frame-Options`, CSP, …) and
`express-rate-limit` (the `RATE_LIMIT_*` knobs above). In single-origin mode
(`SERVE_STATIC_DIR` set) the Content-Security-Policy is tuned to allow the
Vite-built assets (self-hosted scripts, `'unsafe-inline'` styles, `data:`
fonts/images); if a future asset is blocked, adjust the directives in
`backend/src/lib/security.ts`. Rate limiting is auto-disabled under test and can
be turned off in any environment with `RATE_LIMIT_DISABLED=true`.

## Local production smoke test

```bash
cp .env.production.example .env.production   # edit POSTGRES_PASSWORD etc.
APP_PORT=4100 docker compose -f docker-compose.prod.yml --env-file .env.production up --build
```

Verify: `http://localhost:4100/` loads the SPA, `…/api/health` returns
`{"status":"ok"}`, a deep link like `/characters/new` returns the SPA (200), and
data round-trips (`/api/characters`, `/api/reference`). Migrations apply and the
seed (idempotent — upserts only) runs on boot.

## Deploy dev to Railway

1. **Create project** → add an environment named `dev`.
2. **Add Postgres** (Railway plugin). It exposes `DATABASE_URL`.
3. **Add a service** from the GitHub repo. Build using the **root `Dockerfile`**
   (single-origin). Service variables:
   - `DATABASE_URL` → reference the Postgres plugin variable.
   - `SERVE_STATIC_DIR=/app/public` (already set by the image; set explicitly if overriding).
   - `PORT` is provided by Railway; the server honors it.
   - `CORS_ORIGIN` not needed in single-origin mode.
4. **Healthcheck:** path `GET /api/health`.
5. **Boot behavior:** the start command runs `prisma migrate deploy` then
   `prisma db seed` then `node dist/index.js`. Both are safe to run every deploy.
6. **Custom domain:** add `dev.<yourdomain>` to the service. **Remove/disable the
   generated `*.up.railway.app` domain** so the only public entrypoint is the
   Cloudflare-proxied hostname (otherwise the Railway URL bypasses Access).

## Put dev behind Cloudflare Access

The domain is owned but not yet on Cloudflare, so first move DNS:

1. **Add the site** in Cloudflare → it gives you two nameservers.
2. **At the registrar**, replace the nameservers with Cloudflare's. Wait for
   activation (Cloudflare emails you; usually minutes–hours).
3. **DNS record:** add `dev.<yourdomain>` as a **CNAME** to the Railway service
   target, **Proxied (orange cloud)**.
4. **Zero Trust → Access → Applications → Add → Self-hosted:**
   - Application domain: `dev.<yourdomain>`.
   - Policy: **Allow** with an `Emails` rule for your address (and/or add a
     **Google** login method). Enable **One-time PIN** as a fallback login method.
   - Free Zero Trust plan covers up to 50 users — no cost for this.
5. **Verify:** in an incognito window, `https://dev.<yourdomain>` redirects to the
   Cloudflare login; after Google/OTP it loads the app. Confirm the
   `*.up.railway.app` URL no longer resolves to the app.

### Optional hardening (later)

For a fully private origin (no public URL at all), run a **Cloudflare Tunnel**
(`cloudflared`) as a sidecar and point Access at the tunnel instead of a proxied
public hostname. Not required for v1.

## Backups & restore

The whole point of this app is **persistent, long-running campaigns** — months of
character history in the audit log (`CharacterEvent`), inventory, sessions, journal
entries. That history lives entirely in one Postgres volume (`postgres_data`). A
dropped volume or a bad migration loses the campaign. Treat backups as mandatory ops
for any environment that holds real data.

> **Real values used below** (from `docker-compose.yml` / `docker-compose.prod.yml`):
> the DB **service** is `db`, image `postgres:17-alpine`, default **user** and
> **database** are both `character_sheet`, internal **port** `5432`. Dev publishes
> `5432` on the host; the prod compose does **not** publish a host port (the DB is
> reachable only inside the Compose network), so always go through
> `docker compose … exec db …`. If you overrode `POSTGRES_USER`/`POSTGRES_DB` in
> `.env.production`, substitute those names in every command.

### Manual backup (dockerized Postgres)

Use the **custom format** (`-Fc`): it's compressed and restores with `pg_restore`'s
selective/parallel options. Pipe straight to a host file with `-T` (no TTY) so the
redirect lands on your machine, not in the container.

```bash
# Dev stack (docker-compose.yml) — DB is service `db`, user/db = character_sheet
docker compose exec -T db pg_dump -U character_sheet -Fc character_sheet \
  > "backup-$(date +%Y%m%d-%H%M%S).dump"

# Prod stack (docker-compose.prod.yml) — same service name, no host port published
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T db pg_dump -U character_sheet -Fc character_sheet \
  > "prod-backup-$(date +%Y%m%d-%H%M%S).dump"
```

A single database holds everything this app writes, so `pg_dump character_sheet` is a
complete backup. (`pg_dumpall` would also capture cluster-wide roles/globals — not
needed here, since the app uses one role created by the Postgres image. If you ever
add roles, capture them with `pg_dumpall --globals-only`.)

A plain-SQL alternative (human-readable, restores with `psql`) if you prefer it:

```bash
docker compose exec -T db pg_dump -U character_sheet character_sheet \
  | gzip > "backup-$(date +%Y%m%d-%H%M%S).sql.gz"
```

### Manual restore

Restoring the custom-format dump. `--clean --if-exists` drops existing objects first
so the restore is idempotent into a non-empty database:

```bash
# Dev stack
docker compose exec -T db pg_restore -U character_sheet -d character_sheet \
  --clean --if-exists < backup-YYYYMMDD-HHMMSS.dump

# Prod stack
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T db pg_restore -U character_sheet -d character_sheet \
  --clean --if-exists < prod-backup-YYYYMMDD-HHMMSS.dump
```

For the worst case (corrupt/empty volume), bring the DB up fresh and restore into it:

```bash
docker compose up db -d
# wait for healthy, then:
docker compose exec -T db pg_restore -U character_sheet -d character_sheet < backup.dump
```

Restoring the plain-SQL `.sql.gz` variant instead:

```bash
gunzip -c backup-YYYYMMDD-HHMMSS.sql.gz \
  | docker compose exec -T db psql -U character_sheet -d character_sheet
```

After any restore, restart the app/backend so Prisma reconnects, and verify data
round-trips: `…/api/health` is `{"status":"ok"}`, `/api/characters` lists the
expected characters, and a character's audit log still shows its history.

> **✅ Restore path verified (2026-06-26, dev stack).** The full round-trip was run
> end-to-end with the exact commands above: `pg_dump -Fc` → `createdb restore_test` →
> `pg_restore -d restore_test`. All 27 tables matched the source **row-for-row**, a
> 6-table relational join (character → race / class / inventory) was identical, and an
> FK-integrity check found **0 orphaned rows**; the throwaway DB was dropped and the
> live database left untouched. Caveat: the dev dataset's audit-log tables
> (`CharacterEvent`, `Session`, `JournalEntry`) were empty, so populated-history
> fidelity is inferred from the mechanism (every populated table + all FKs restored
> exactly), not separately exercised. Re-run this dry run after major schema changes —
> the recipe is the dump/restore commands above into a throwaway DB.

### Automated backups for hosted (Railway) dev

The dev host is Railway behind Cloudflare Access (see above). Railway's Postgres
plugin exposes a `DATABASE_URL` (and `PG*` vars), so `pg_dump` can run against it
directly — no `docker compose` indirection:

```bash
pg_dump "$DATABASE_URL" -Fc -f "cs-$(date +%Y%m%d).dump"
```

Recommended automated path, in order of preference:

1. **Railway cron service.** Add a second service (a tiny image with `postgres-client`
   + `awscli`/`rclone`) on a **cron schedule** (e.g. daily `0 4 * * *`). It runs the
   `pg_dump "$DATABASE_URL" -Fc` above and uploads the dump to **off-box object
   storage** (S3, Cloudflare R2, Backblaze B2). Off-box is the point — a backup that
   lives in the same Railway project dies with it.
2. **Managed snapshots.** If the Postgres plugin/plan offers automated daily snapshots,
   enable them as a baseline — but still keep an independent off-box `pg_dump`, since
   provider snapshots are tied to the same account/provider.

**Retention:** keep ~7 daily + 4 weekly + a few monthly dumps. Enforce it with the
storage provider's lifecycle/expiry rules (e.g. S3/R2 lifecycle policy) rather than a
hand-rolled cleanup script, and confirm new dumps are actually landing.

**If full automation is deferred:** run the manual `pg_dump` above on a fixed cadence —
**before every migration/deploy** (see below) and at least **weekly** during active
play — and copy the dump off the host. Document the last-known-good backup date
somewhere the DM will see it.

### Prisma migrations: a bad migration needs a restore, not a rollback

Prisma migrations are **forward-only**. The deploy path
(`prisma migrate deploy`, run on every container/Railway boot — see `development.md`)
only ever rolls migrations *forward*; there is no `migrate down`/rollback. A migration
that drops or corrupts data **cannot be undone by Prisma** — the recovery path is a
**database restore** from the most recent good dump.

Therefore:

- **Always take a fresh `pg_dump` immediately before applying a new migration** to any
  environment with real data. That dump is your only rollback.
- Develop migrations against a throwaway DB (`prisma migrate dev` locally, or a
  worktree's isolated stack — see `development.md`), never first against prod data.
- If a deployed migration goes wrong: restore the pre-migration dump (above), fix the
  migration in code, and only then redeploy. Don't try to hand-patch a half-applied
  migration in place.

## When prod comes

Prod is blocked on in-app authentication + a user/character ownership model. Once
that exists, prod can reuse the same combined image in a second Railway
environment, public (no Access) or with its own policy as desired.
