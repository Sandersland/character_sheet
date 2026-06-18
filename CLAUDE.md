# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This is a D&D 5e character sheet app, now in **Phase 2: Character persistence**. Postgres + Prisma are wired up, and a `Character` resource exists end-to-end: `GET /api/characters`, `GET /api/characters/:id`, and `PATCH /api/characters/:id`, backed by a real `characters` table. `InventoryItem`/`Spell`/`JournalEntry` are still **not** separate models — inventory, spellcasting, and journal entries live as JSON columns on the `Character` row and are round-tripped opaquely; normalizing those into their own tables/routes is left for a later phase. Character creation (`POST /api/characters`) also doesn't exist yet — `NewCharacterCard` on the list page is still a placeholder.

A character's `level` and `proficiencyBonus` are never stored directly — they're always derived from `experiencePoints` via the 5e XP table in `backend/src/lib/experience.ts`, and computed fresh into every API response. Don't add `level`/`proficiencyBonus` back as persisted/settable fields; change `experiencePoints` instead.

## Commands

Run everything via Docker Compose from the repo root:

```
docker compose up --build
```

This starts `db` (Postgres 17, port 5432), `pgadmin` (DB GUI, port 5050), `backend` (Express, port 4000), and `frontend` (Vite, port 5173). `backend`'s container `CMD` runs `prisma generate && prisma migrate deploy && prisma db seed` before starting `tsx watch`, so a fresh `docker compose up --build` ends up with the schema applied and three sample characters seeded automatically — both steps are idempotent (`migrate deploy` no-ops if already applied, `db seed` upserts) so they're safe to run on every container start. Source is bind-mounted with hot reload as before.

Root-level scripts fan out to both workspaces (`backend`, `frontend` — this is an npm workspaces monorepo):

```
npm run dev      # runs each workspace's dev script
npm run lint      # ESLint in each workspace
npm run test      # Vitest in each workspace
npm run build     # production build in each workspace
```

To run a single workspace's commands directly (e.g. for a single test file), `cd` into `backend/` or `frontend/` and use that workspace's `package.json` scripts, e.g. `npx vitest run src/routes/__tests__/health.test.ts` in `backend/`, or `npx vitest run src/api/client.test.ts` in `frontend/`. **`backend`'s tests now need a reachable Postgres** — run `docker compose up db -d` first, and export `DATABASE_URL` (see `backend/.env.example`/`.env`) in the shell running `vitest`.

Both services can also run outside Docker for faster iteration: `npm install` then `npm run dev` inside `backend/` or `frontend/` (the frontend expects the backend reachable at `VITE_API_URL`, default `http://localhost:4000/api`; the backend expects Postgres reachable at `DATABASE_URL`, e.g. via `docker compose up db -d` plus a `backend/.env` with `DATABASE_URL=postgresql://character_sheet:character_sheet@localhost:5432/character_sheet`). Prisma CLI commands (`prisma generate`, `prisma migrate dev`, `prisma db seed`) are run from `backend/` and also need `DATABASE_URL` set.

## Architecture

**Backend** (`backend/src`): an Express app. `app.ts` builds the Express instance (CORS + JSON middleware, mounts routers under `/api`) and is exported separately from `index.ts` (which just reads `PORT` and calls `listen`) so the app can be imported directly into tests without binding a port — see `routes/__tests__/health.test.ts` and `routes/__tests__/characters.test.ts`, both driven with `supertest`. Each resource gets its own router file under `src/routes/`, mounted in `app.ts` (`health.ts`, `characters.ts`). `src/lib/prisma.ts` exports a singleton `PrismaClient` (using the `@prisma/adapter-pg` driver adapter, required by Prisma 7); `src/lib/experience.ts` holds the 5e XP-to-level/proficiency-bonus table and pure functions derived from it — this is the only place that table is allowed to live (not duplicated on the frontend, not a DB table). The Prisma client is generated into `src/generated/prisma` (gitignored — run `npx prisma generate` after a fresh clone or schema change) rather than into `node_modules`.

**Frontend** (`frontend/src`): a Vite + React + TypeScript SPA styled with Tailwind v4 (loaded via the `@tailwindcss/vite` plugin in `vite.config.ts` — there's intentionally no `tailwind.config.js`/`postcss.config.js`; the only Tailwind setup is the `@import "tailwindcss";` line in `src/index.css`). Routing is `react-router-dom`, declared in `App.tsx`: `/` renders `CharacterListPage`, `/characters/:id` renders `CharacterSheetPage`. Both pages fetch real data (no more mock data — `src/mock/` has been removed) and render loading/error states alongside the existing empty/not-found states. All backend calls go through `src/api/client.ts`, which reads the API base URL from `VITE_API_URL` — add new backend calls there rather than calling `fetch` directly from components.

**Docker Compose**: `db` (Postgres) and `pgadmin` (DB GUI), plus `backend` and `frontend`, each of the latter two built from its own `Dockerfile` with the corresponding directory bind-mounted into the container (so edits on the host trigger hot reload) and an anonymous/named volume shadowing `node_modules` (so the container's installed dependencies aren't clobbered by the bind mount). There is no shared root `Dockerfile` — backend and frontend are independent npm packages, each installing its own dependencies; the root `package.json`'s npm workspaces setup is only used for fanning out `dev`/`lint`/`test`/`build` scripts when working outside Docker, not for the container builds.

When a later phase normalizes inventory/spells/journal into their own models: add `InventoryItem`/`Spell`/`JournalEntry` to `prisma/schema.prisma` as relations off `Character`, generate a migration, and add new router files under `backend/src/routes/` following the `characters.ts` pattern, each paired with a new function in `frontend/src/api/client.ts` and a component under `frontend/src/components/`.
