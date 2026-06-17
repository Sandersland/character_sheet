# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This is a D&D 5e character sheet app, currently in **Phase 1: framework scaffold**. Only the Docker Compose orchestration, the backend skeleton, and the frontend skeleton exist. There is **no database yet** — no Postgres service, no Prisma, no `Character`/`InventoryItem`/`Spell`/`JournalEntry` models, and no resource API routes. The backend currently exposes a single `GET /api/health` endpoint, and the frontend's `CharacterListPage` calls it on load to prove the two services can reach each other. Persistence (Postgres + Prisma + the actual character data model and CRUD routes) is planned for a later phase — don't assume it exists when reading the code.

## Commands

Run everything via Docker Compose from the repo root:

```
docker compose up --build
```

This starts `backend` (Express, port 4000) and `frontend` (Vite, port 5173) with bind-mounted source and hot reload (`tsx watch` / Vite dev server). There is no `db` service yet.

Root-level scripts fan out to both workspaces (`backend`, `frontend` — this is an npm workspaces monorepo):

```
npm run dev      # runs each workspace's dev script
npm run lint      # ESLint in each workspace
npm run test      # Vitest in each workspace
npm run build     # production build in each workspace
```

To run a single workspace's commands directly (e.g. for a single test file), `cd` into `backend/` or `frontend/` and use that workspace's `package.json` scripts, e.g. `npx vitest run src/routes/__tests__/health.test.ts` in `backend/`, or `npx vitest run src/api/client.test.ts` in `frontend/`.

Both services can also run outside Docker for faster iteration: `npm install` then `npm run dev` inside `backend/` or `frontend/` (the frontend expects the backend reachable at `VITE_API_URL`, default `http://localhost:4000/api`).

## Architecture

**Backend** (`backend/src`): a minimal Express app. `app.ts` builds the Express instance (CORS + JSON middleware, mounts routers under `/api`) and is exported separately from `index.ts` (which just reads `PORT` and calls `listen`) so the app can be imported directly into tests without binding a port — see `routes/__tests__/health.test.ts`, which drives the app with `supertest`. Each resource is expected to get its own router file under `src/routes/`, mounted in `app.ts`; `health.ts` is the only one so far.

**Frontend** (`frontend/src`): a Vite + React + TypeScript SPA styled with Tailwind v4 (loaded via the `@tailwindcss/vite` plugin in `vite.config.ts` — there's intentionally no `tailwind.config.js`/`postcss.config.js`; the only Tailwind setup is the `@import "tailwindcss";` line in `src/index.css`). Routing is `react-router-dom`, declared in `App.tsx`: `/` renders `CharacterListPage`, `/characters/:id` renders `CharacterSheetPage`. All backend calls go through `src/api/client.ts`, which reads the API base URL from `VITE_API_URL` — add new backend calls there rather than calling `fetch` directly from components.

**Docker Compose**: two services, `backend` and `frontend`, each built from its own `Dockerfile` with the corresponding directory bind-mounted into the container (so edits on the host trigger hot reload) and an anonymous/named volume shadowing `node_modules` (so the container's installed dependencies aren't clobbered by the bind mount). There is no shared root `Dockerfile` — backend and frontend are independent npm packages, each installing its own dependencies; the root `package.json`'s npm workspaces setup is only used for fanning out `dev`/`lint`/`test`/`build` scripts when working outside Docker, not for the container builds.

When the next phase adds Postgres/Prisma: add a `db` service to `docker-compose.yml`, a `prisma/schema.prisma` + migrations under `backend/`, and new router files under `backend/src/routes/` following the same pattern as `health.ts`, each paired with a new function in `frontend/src/api/client.ts` and a component under `frontend/src/components/`.
