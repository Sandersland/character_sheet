# Deployment

Read this when packaging the app for hosting, deploying the hosted environment (Railway behind Cloudflare Access), or running backups/restores.

## Packaging model

One deployable image: the root `Dockerfile`, combined single-origin — the API serves the built SPA. Railway and `docker-compose.prod.yml` both use it. It builds from the **repo root context**, because the npm-workspaces install must link `packages/*` (shared types, #820):

```bash
docker build -f Dockerfile .
```

Single-origin is a commitment, not a default: one hostname → one Cloudflare Access policy, same-origin fetch, no CORS/cookie problems. A split-mode pair of images existed until #1456 deleted them — nothing had ever built them, and the backend one had silently become a duplicate of this image's backend stage.

CI builds this image on every PR (#1454), so a stage rename or a broken `COPY` fails the PR rather than the deploy.

### Environment variables

| Var | Notes |
|---|---|
| `DATABASE_URL` | Required. |
| `PORT` | Backend listen port (default 4000; Railway injects its own). |
| `SERVE_STATIC_DIR` | Set → API serves the SPA from this dir (single-origin; combined image sets `/app/public`). Unset → API-only. |
| `CORS_ORIGIN` | Comma-separated allowlist; empty reflects the request origin. Credentials are always sent, so the origin is never `*` — set explicitly for split-origin prod. |
| `APP_BASE_URL` | Browser-facing origin; builds the OAuth `redirect_uri` + post-login redirect. Dev default `http://localhost:5173` (the SPA proxies `/api`). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Provider enabled only when both set; absent → app boots with no providers. |
| `SESSION_COOKIE_SECURE` | Tri-state: default on in production, off elsewhere. |
| `ALLOW_DEV_LOGIN` | Enables `POST /api/auth/dev-login`. Hard-forced off when `NODE_ENV=production`, which is why `.env.example` ships it on for local dev. |
| `LOG_LEVEL`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_CREATE_MAX`, `RATE_LIMIT_DISABLED` | Logging + rate-limit knobs; limiter auto-off under test. |
| `BLOB_STORE_DRIVER` | Blob storage driver, `s3` or `fs`. Defaults to `fs` outside production; required (throws at first use) in production. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | S3-compatible target when driver is `s3` (R2/S3/MinIO/B2/Spaces). Bucket + both creds required; endpoint required by every provider except AWS; region defaults to `auto`; path-style addressing defaults on — set `S3_FORCE_PATH_STYLE=false` only on real AWS. |
| `BLOB_FS_DIR` | `fs` driver directory; defaults to a path under the OS tmpdir, outside the repo tree. |
| `VITE_API_URL` | Frontend build/dev: `/api` for single-origin, absolute API URL for split. |
| `VITE_PROXY_TARGET` | Vite dev proxy target; defaults to `http://localhost:4000`. A worktree slot's `frontend/.env` points it at that slot's backend port. |

**OAuth setup (dev):** Google Cloud Console → Web application client, redirect URI `http://localhost:5173/api/auth/google/callback` (= `${APP_BASE_URL}/api/auth/google/callback`); put the id/secret in the gitignored `backend/.env` (the only file the host-run backend loads) and restart `npm run dev`.

### CSP notes (single-origin mode)

`backend/src/lib/core/security.ts` owns helmet/CSP. First-party inline scripts (the pre-paint theme snippet) are allowlisted by **hash computed at boot from the served `index.html`** — so editing the snippet needs no CSP change. Cloudflare edge injections get a per-request nonce (their hashes churn per request; a **stable** hash on a CSP violation means a first-party script — this misread once cost an afternoon). If a future asset is blocked, adjust directives in that file.

## Local production smoke test

```bash
cp .env.production.example .env.production   # edit POSTGRES_PASSWORD etc.
APP_PORT=4100 docker compose -f docker-compose.prod.yml --env-file .env.production up --build
```

Verify: `/` loads the SPA, `/api/health` returns ok, a deep link returns the SPA, data round-trips.

## Railway + Cloudflare Access

Two environments, and the names matter because every CLI flag takes one:

| Environment | Services | State |
|---|---|---|
| `staging` | `character_sheet` (the app) + `Postgres-6QpG` | Live at `staging.characters.andersland.dev`, deploys from the `staging` branch |
| `production` | `Postgres` only | Provisioned, **never migrated** — no app service yet |

**`staging` is what runs, and it deploys from `staging` — not `main`.** Promoting to `main` is bookkeeping, not a release; the code is already serving before the promote.

Setup per environment: Postgres plugin (`DATABASE_URL`) → service from the repo. Build and deploy settings live in `railway.json`, which **overrides the dashboard** — change them there, not in the UI. Add the custom domain and **disable the generated `*.up.railway.app` domain** (it would bypass Access).

**Migrations run as a pre-deploy command, not just at boot.** Railway runs `preDeployCommand` after the build and before the new version is allowed to serve, and a non-zero exit halts the deploy. That is the difference between a bad migration being a red deploy and being the crash-loop that cost 13 hours (#1373). The container `CMD` still applies migrations too — that path is what `docker-compose.prod.yml` relies on, and the re-run is a no-op migration plus an idempotent seed.

Pre-deploy runs in a **separate container** from the app and cannot touch volumes or the filesystem, so nothing filesystem-bound may move into it.

Cloudflare: move DNS to Cloudflare, CNAME the environment's hostname (`staging.<domain>`) → the Railway target (proxied), then Zero Trust → Access → self-hosted app on that hostname with an email Allow policy (+ One-time PIN fallback). Verify incognito hits the Access login and the Railway URL no longer serves the app.

## Backups & restore

Months of campaign history live in one Postgres volume; a bad migration or dropped volume loses it. The DB service is `db`, user/database both `character_sheet`. Prod compose publishes no host port — always go through `docker compose … exec db`.

```bash
# Backup (custom format — compressed, selective restore):
docker compose exec -T db pg_dump -U character_sheet -Fc character_sheet \
  > "backup-$(date +%Y%m%d-%H%M%S).dump"
# (prod: add -f docker-compose.prod.yml --env-file .env.production)

# Restore (idempotent into a non-empty DB):
docker compose exec -T db pg_restore -U character_sheet -d character_sheet \
  --clean --if-exists < backup-YYYYMMDD-HHMMSS.dump
```

One database holds everything, so `pg_dump character_sheet` is a complete backup. After a restore, restart the backend and verify `/api/health` + `/api/characters` + an audit log. (The restore path was verified end-to-end 2026-06-26 — re-run the dry run into a throwaway DB after major schema changes.)

On Railway, `railway run -- sh -c 'pg_dump "$DATABASE_PUBLIC_URL" -Fc'` works directly — `DATABASE_URL` is the internal host and will not resolve from a laptop. Automate with a cron service uploading to **off-box** object storage (a backup living in the same Railway project dies with it). Retention ~7 daily + 4 weekly via the storage provider's lifecycle rules. If automation is deferred: manual dump before every migration/deploy and at least weekly during active play.

**Prisma migrations are forward-only** — there is no rollback. A migration that drops or corrupts data is recovered by **restoring the pre-migration dump**, fixing the migration in code, and redeploying. Always take a fresh dump immediately before applying a migration to any environment with real data; develop migrations against a throwaway DB first.

### A failed migration blocks every later one (P3009)

`migrate deploy` refuses to apply **anything** once one migration has failed, so the schema stops advancing while later migrations' models and columns appear simply "missing" and the backend container exits 1 on every boot. Look here first — it reads like an unrelated feature being broken. One instance cost 13 hours (#1373). Recovery is always operational: a fix-up migration can never run (it sits behind the failed one) and editing the failed migration's SQL changes its checksum, after which `migrate dev` reports it "was modified after it was applied".

```bash
# 1. Which migration failed, and why (logs holds the Postgres error):
docker compose exec -T db psql -U character_sheet -d character_sheet -c \
  "SELECT migration_name, started_at, finished_at, rolled_back_at, logs
     FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;"

# 2. Take a full dump first (backup command above). Non-negotiable — step 4 deletes rows.

# 3. Find the blocking rows. An enum narrowing aborts on rows still holding a
#    dropped value; the dropped values are those absent from the migration's
#    CREATE TYPE "<Enum>_new" AS ENUM (...) list. e.g.:
docker compose exec -T db psql -U character_sheet -d character_sheet -c \
  "SELECT type, count(*) FROM \"CharacterEvent\"
    WHERE type::text IN ('learnDiscipline','disciplinesReconciled') GROUP BY type;"

# 4. Remap them to a surviving value, or delete them — an explicit decision,
#    recorded. Deleting a CharacterEvent cascades its CharacterEventField rows
#    and can strand a sibling event from the same batch; note what you removed.

# 5. Clear the failed attempt, then re-run. Both are safe to repeat.
docker compose exec -T backend npx prisma migrate resolve --rolled-back <migration_name>
docker compose exec -T backend npx prisma migrate deploy
```

Done when the step-1 query returns no unfinished row, `migrate status` reports all migrations applied, `/api/health` is ok, and an audit log renders.

On Railway, run the same steps against the environment by name — the database service is **not** called `Postgres` in every environment, so `railway connect Postgres` fails on `staging`:

```bash
railway link --project character_sheet --environment staging --service Postgres-6QpG
railway connect        # interactive psql

# The Prisma CLI, against that environment — the URL is injected into the
# subprocess, so it is never typed, echoed, or left in shell history.
railway run -- sh -c 'cd backend && DATABASE_URL="$DATABASE_PUBLIC_URL" npx prisma migrate status'
```

**Use `DATABASE_PUBLIC_URL`, never `DATABASE_URL`** — the service's own is `*.railway.internal` and is unreachable from a laptop. `railway run` injects it into a subprocess, which is how to reach the DB from a script without ever printing the credential:

```bash
railway run -- node your-read-only-check.mjs   # reads process.env.DATABASE_PUBLIC_URL
```

### Catalog content ships in the seed, not in migrations (#1277)

Every boot command runs `prisma migrate deploy && prisma db seed` as one step (root `Dockerfile`, `backend/Dockerfile`; `scripts/check-seed-required.sh` enforces this in CI/lefthook) — a database that only migrated and never seeded 500s the moment a route reads a catalog row it type-checked fine against. Catalog content (subclasses, spells, feats, packs, …) is **not** moved into data migrations, for four reasons:

1. **The failure mode is already structurally prevented** — there is no deployment path that runs `migrate deploy` without also running `db seed` (enforced above), so this is a defense-in-depth gate, not a live gap.
2. **Data migrations can't express what the seed does.** Several seeders (`seedFeats`, `seedSpells`, `seedShadowArts`) prune stale rows, and spell seeding layers over `SPELL_COLUMN_DEFAULTS` so a removed optional field actually resets on re-seed (#1132's Barkskin fix) — an append-only migration history can only add UPDATEs, never re-derive a row.
3. **A failed data migration is catastrophic; a failed seed is not.** A failed migration means P3009 — every migration behind it is blocked (see above; one instance cost 13 hours, #1373). A failed seed exits 1, leaves the schema advanced, and retries clean on the next boot.
4. **Migrations are checksummed** — a content typo in a migration can never be corrected in place, unlike a seed row.

Preventing the enum case is a CI gate — see `docs/development.md`, "Prisma workflow".

## When prod comes

Auth + ownership are shipped, so prod reuses the combined image. The `production` environment already exists but holds **only a Postgres service, never migrated** — there is no app service and no data, so it is a reservation rather than a deployment. Remaining: the app service itself, a prod Google OAuth client + redirect URI, and `APP_BASE_URL`/`GOOGLE_CLIENT_*`/`SESSION_COOKIE_SECURE=true` for the prod origin.
