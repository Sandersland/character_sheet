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

Local setup: `backend/.env` must contain `DATABASE_URL` (`cp .env.example backend/.env` on a fresh clone); `backend/vitest.config.ts` reads it automatically via `loadEnv`. Tests derive their own databases from it on the same server and never read or write the one it names, so a test run can't disturb your dev data.

## Backend route tests (`backend/src/routes/__tests__/`)

`supertest` against `createApp()`, real Postgres via Prisma — no mocks.

**Fixture rules (parallel files, one database per worker):**

Each vitest worker runs against its own database, cloned in `globalSetup` from a migrated+seeded template. A worker still runs many files in sequence, so files sharing a worker still see each other's leftovers.

- Upsert catalog fixtures in `beforeEach`; delete only what the test created (`afterEach`/`afterAll`).
- **Never `deleteMany` a seeded catalog row** — use uniquely-named fixture rows (e.g. `"Spellcasting Route Test Wizard"`, with the class-entry *snapshot* `name` set to `"wizard"` so rule lookups still match). A wiped catalog row stays wiped for every later file on that worker; the next run rebuilds from the template.
- Use `ensureTestOwner("owner-<domain>")` for the `ownerId` every character needs.
- Don't add a `fileParallelism` override, and don't reach for `--fileParallelism=false` to make a flaky suite pass — cross-file interference is a leaking fixture, not a scheduling problem. Connection teardown is handled by `backend/vitest.setup.ts` (`$disconnect()` + `pool.end()`).

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

Specs live in `frontend/e2e/`; run via `npm run e2e` (→ `docker compose --profile e2e run --rm e2e`, a pinned Playwright image that reaches the host-run dev servers via `host.docker.internal` and derives its base URL from `FRONTEND_PORT`, so it works against the main checkout or any worktree slot).

**Start `npm run dev` first.** The runner used to `depends_on` the frontend container; that container is gone (#1458), so it now dials servers it does not start. A suite that fails instantly with connection refused means the dev servers aren't up.

- `global-setup.ts` signs in via dev-login, then per persona verifies the live character against its declared fingerprint (class, subclass, XP, class-entry level, campaign, maneuver/spell picks), deleting and recreating on any mismatch — in-place repair can't reach the declared state (a repaired subclass leaves the old one's residue behind). See `ROSTER` in `frontend/e2e/global-setup.ts` for the roster itself.
- Per-spec state is created **inside each spec** via `e2e/helpers/api.ts`, never in globalSetup — every spec is independently runnable and personas stay unmutated.
- Session-driving personas get their own campaigns (one active session per campaign); `workers: 1` runs serially.
- The stack sets `RATE_LIMIT_DISABLED=true` (compose + CI) so repeated runs never trip the limiter.
- Selectors are role/name-based; specs assert zero console errors (`e2e/helpers/console.ts`).
- Debris characters left by specs (`<prefix> <suffix>` names, e.g. `Nav Hero …`) are never touched — only exact `ROSTER` names can be recreated — and accumulate across runs; clean them up manually via pgAdmin (`docker compose --profile tools up pgadmin`, see `docs/development.md`).

**Visual regression** (`e2e/visual.spec.ts`): pixel baselines are checked-in source fixtures under `frontend/e2e/__screenshots__/` (allowlisted in the artifact-blocking hook). Determinism: animations disabled, fixed viewport, fonts pinned to the e2e image (Google Fonts blocked), per-run-unique pixels masked. Regenerate **only for intentional visual changes**, from inside the container (`docker compose --profile e2e run --rm e2e npm run e2e:update-snapshots`) and review the PNGs — blanket `--update-snapshots` launders regressions into the baseline.
