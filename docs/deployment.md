# Deployment

Read this when packaging the app for hosting, deploying the dev environment (Railway behind Cloudflare Access), or running backups/restores.

## Packaging model

| Image | File | Use |
|---|---|---|
| Combined single-origin | `Dockerfile` (root) | API serves the built SPA on one origin. Railway dev + `docker-compose.prod.yml`. |
| Backend (API-only) | `backend/Dockerfile.prod` | Split deploys. |
| Frontend (nginx static) | `frontend/Dockerfile.prod` | Split deploys; SPA fallback. |

Single-origin is deliberate: one hostname → one Cloudflare Access policy, same-origin fetch, no CORS/cookie problems.

Every image builds from the **repo root context** — the npm-workspaces install must link `packages/*` (shared types, #820) — so split builds pass `-f`, never a subdirectory context:

```bash
docker build -f backend/Dockerfile.prod .
docker build -f frontend/Dockerfile.prod --build-arg VITE_API_URL=https://api.example.com/api .
```

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
| `ALLOW_DEV_LOGIN` | Enables `POST /api/auth/dev-login`. Hard-forced off when `NODE_ENV=production`. Dev compose defaults it on. |
| `LOG_LEVEL`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_CREATE_MAX`, `RATE_LIMIT_DISABLED` | Logging + rate-limit knobs; limiter auto-off under test. |
| `VITE_API_URL` | Frontend build/dev: `/api` for single-origin, absolute API URL for split. |
| `VITE_PROXY_TARGET` | Vite dev proxy target (compose: `http://backend:4000`). |

**OAuth setup (dev):** Google Cloud Console → Web application client, redirect URI `http://localhost:5173/api/auth/google/callback` (= `${APP_BASE_URL}/api/auth/google/callback`); put the id/secret in a gitignored root `.env` and recreate the containers.

### CSP notes (single-origin mode)

`backend/src/lib/core/security.ts` owns helmet/CSP. First-party inline scripts (the pre-paint theme snippet) are allowlisted by **hash computed at boot from the served `index.html`** — so editing the snippet needs no CSP change. Cloudflare edge injections get a per-request nonce (their hashes churn per request; a **stable** hash on a CSP violation means a first-party script — this misread once cost an afternoon). If a future asset is blocked, adjust directives in that file.

## Local production smoke test

```bash
cp .env.production.example .env.production   # edit POSTGRES_PASSWORD etc.
APP_PORT=4100 docker compose -f docker-compose.prod.yml --env-file .env.production up --build
```

Verify: `/` loads the SPA, `/api/health` returns ok, a deep link returns the SPA, data round-trips.

## Railway dev + Cloudflare Access

Railway: project with a `dev` environment → Postgres plugin (`DATABASE_URL`) → service from the repo using the root `Dockerfile`; healthcheck `GET /api/health`; boot runs `migrate deploy` + `db seed` + `node dist/index.js`. Add the custom domain and **disable the generated `*.up.railway.app` domain** (it would bypass Access).

Cloudflare: move DNS to Cloudflare, CNAME `dev.<domain>` → the Railway target (proxied), then Zero Trust → Access → self-hosted app on that hostname with an email Allow policy (+ One-time PIN fallback). Verify incognito hits the Access login and the Railway URL no longer serves the app.

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

For hosted (Railway) dev, `pg_dump "$DATABASE_URL" -Fc` works directly; automate with a cron service uploading to **off-box** object storage (a backup living in the same Railway project dies with it). Retention ~7 daily + 4 weekly via the storage provider's lifecycle rules. If automation is deferred: manual dump before every migration/deploy and at least weekly during active play.

**Prisma migrations are forward-only** — there is no rollback. A migration that drops or corrupts data is recovered by **restoring the pre-migration dump**, fixing the migration in code, and redeploying. Always take a fresh dump immediately before applying a migration to any environment with real data; develop migrations against a throwaway DB first.

## When prod comes

Auth + ownership are shipped, so prod reuses the combined image in a second Railway environment (public, or behind its own Access policy). Remaining: a prod Google OAuth client + redirect URI, and `APP_BASE_URL`/`GOOGLE_CLIENT_*`/`SESSION_COOKIE_SECURE=true` for the prod origin.
