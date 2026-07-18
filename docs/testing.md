# Testing

Read this when running or writing tests.

> **Tests don't type-check.** Vitest transpiles with esbuild, so type-only errors pass `npm test` but break the `tsc` build. Run `npm run typecheck` (or `npm run build`) before pushing type-significant changes.

## Running tests

```bash
docker compose up db -d          # backend tests need Postgres
npm run test                     # both workspaces
npm run test -w backend          # backend only
cd backend && npx vitest run src/routes/__tests__/spellcasting.test.ts   # one file
npm run test:coverage -w backend # Istanbul coverage → feeds the fallow CRAP gate
cd frontend && npx vitest run    # frontend (no DB)
```

Local setup: `backend/.env` must contain `DATABASE_URL` (`cp .env.example backend/.env` on a fresh clone); `backend/vitest.config.ts` reads it automatically via `loadEnv`.

## Backend route tests (`backend/src/routes/__tests__/`)

`supertest` against `createApp()`, real Postgres via Prisma — no mocks.

**Fixture rules (parallel files, one shared DB):**

- Upsert catalog fixtures in `beforeEach`; delete only what the test created (`afterEach`/`afterAll`).
- **Never `deleteMany` a seeded catalog row** — use uniquely-named fixture rows (e.g. `"Spellcasting Route Test Wizard"`, with the class-entry *snapshot* `name` set to `"wizard"` so rule lookups still match). If you nuke a seeded row: `cd backend && npx prisma db seed`.
- **Unique, file-prefixed fixture IDs + a per-file owner** (`ensureTestOwner("owner-<domain>")`, `backend/src/test-support/owner.ts`) so parallel suites never collide.
- **Never assert on an unscoped/global list** — tables hold the union of every running suite's fixtures. Find your own row (`findInList`, `test-support/list.js`) and assert on it; an eslint `no-restricted-syntax` rule backstops this for `GET /api/characters`.
- Don't add a `fileParallelism` override — the speed matters. Connection teardown is handled by `backend/vitest.setup.ts` (`$disconnect()` + `pool.end()`).

**Every transaction endpoint gets:** a 404 test (unknown character), a 400 test (malformed op), one test per domain error, and a multi-op **atomicity** test (a failing second op rolls back the first).

Pure domain logic gets lib-level unit tests in `backend/src/lib/__tests__/`.

## Frontend tests

Colocated next to their source (no `__tests__/` dir): `*.test.ts` for pure logic/fetch-mocks, `*.test.tsx` for component render tests (RTL + user-event). Conventions:

- `globals: false` — always import from `"vitest"` explicitly.
- Query by accessible role/name. Gotchas: `<img alt="">` has role `presentation` (use `container.querySelector`); a button's accessible name is its text, not its `title`.
- Add an axe check (`import { axe } from "@/test/axe"` → `toHaveNoViolations`) for surfaces with form controls or interactive widgets; `Card.test.tsx` is the reference.
- Router-dependent components wrap in `MemoryRouter`. Build one fully-typed fixture per file and spread-override per test.
- Stub `@/features/dice/DiceRoller` (Three.js won't render in jsdom); the lazy import resolves a tick later, so assert with `findByTestId`.

## Browser / UI verification (behind auth)

Real-browser verification hits `requireAuth` and OAuth can't complete headless. Path: bring the stack up → `npm run seed:verify` (dev-login session + a representative "Verify Dummy" character; needs `ALLOW_DEV_LOGIN=true`, the dev-compose default) → in Playwright, sign in with an in-page `fetch('/api/auth/dev-login', { method: 'POST' })` then reload (the cookie is HttpOnly). The `verify-frontend` skill automates all of this.

## End-to-end (Playwright)

Specs live in `frontend/e2e/`; run via `npm run e2e` (→ `docker compose --profile e2e run --rm e2e`, a pinned Playwright image on host networking that derives its base URL from `FRONTEND_PORT`, so it works against the main stack or any worktree slot).

- `global-setup.ts` signs in via dev-login and idempotently recreates the shared personas (Smoke Fighter, Wizard L5, Battle Master, Session Fighter) — safe after a backend vitest pass wipes the dev user.
- Per-spec state is created **inside each spec** via `e2e/helpers/api.ts`, never in globalSetup — every spec is independently runnable and personas stay unmutated.
- Session-driving personas get their own campaigns (one active session per campaign); `workers: 1` runs serially.
- The stack sets `RATE_LIMIT_DISABLED=true` (compose + CI) so repeated runs never trip the limiter.
- Selectors are role/name-based; specs assert zero console errors (`e2e/helpers/console.ts`).

**Visual regression** (`e2e/visual.spec.ts`): pixel baselines are checked-in source fixtures under `frontend/e2e/__screenshots__/` (allowlisted in the artifact-blocking hook). Determinism: animations disabled, fixed viewport, fonts pinned to the e2e image (Google Fonts blocked), per-run-unique pixels masked. Regenerate **only for intentional visual changes**, from inside the container (`docker compose --profile e2e run --rm e2e npm run e2e:update-snapshots`) and review the PNGs — blanket `--update-snapshots` launders regressions into the baseline.
