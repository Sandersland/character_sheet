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
| `CORS_ORIGIN` | backend | Comma-separated allowlist. Empty → reflect all (fine for single-origin/local). Set for split mode. |
| `VITE_API_URL` | frontend **build** | Baked at build time. `/api` for single-origin; the API's absolute URL for split. |

The single-origin design is deliberate: one hostname means one Cloudflare Access
policy, same-origin `fetch` (no CORS), and no cross-origin Access-cookie problems.

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

## When prod comes

Prod is blocked on in-app authentication + a user/character ownership model. Once
that exists, prod can reuse the same combined image in a second Railway
environment, public (no Access) or with its own policy as desired.
