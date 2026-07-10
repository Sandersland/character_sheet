# Development

## Quickstart

```bash
# Start everything (db + backend + frontend) with hot reload:
docker compose up --build

# Services:
#   Postgres      localhost:5432
#   Backend API   localhost:4000/api
#   Frontend      localhost:5173

# pgAdmin is opt-in (behind the `tools` profile):
docker compose --profile tools up pgadmin   # localhost:5050
```

On every container start, both dev containers run `npm install` first, then the backend runs `prisma generate && prisma migrate deploy && prisma db seed` before starting `tsx watch`. All are idempotent (npm install is a fast no-op when nothing changed; migrate deploy no-ops if already applied; seed uses upserts). The seed is **catalog-only** (items, spells, classes, races, …) — it creates no users or characters, so a fresh stack has an empty party behind the login screen. To get a signed-in user + a representative character for viewing/UI verification, run `npm run seed:verify` (see below).

> **Adding a dependency?** Just edit `package.json` (or `npm install <pkg>` locally) and `docker compose up --build`. The startup `npm install` reconciles the `node_modules` named volume, so a new dependency is picked up without manually removing the volume. (The volume is seeded from the image only on first creation, so without this it would otherwise shadow newly-built deps.)

## Root scripts (fan out to both workspaces)

```bash
npm run dev       # backend (tsx watch) + frontend (vite) in parallel
npm run lint      # ESLint in each workspace
npm run typecheck # tsc --noEmit in each workspace — fast type-only check
npm run test      # Vitest in each workspace
npm run build     # production build in each workspace
npm run e2e       # Playwright e2e via the profile-gated compose service
```

`npm run e2e` shells out to `docker compose --profile e2e run --rm e2e` — a pinned `mcr.microsoft.com/playwright` container on host networking that seeds personas via `dev-login` and runs the specs in `frontend/e2e/`. It derives its base URL from `FRONTEND_PORT`, so the same command works against the main stack and any worktree slot; see testing.md for the full harness.

CI runs the same suite in a dedicated `e2e` job (`.github/workflows/ci.yml`) on every PR and on `main`/`staging` pushes. Rather than the compose profile, the job reuses the `test` job's `postgres:17-alpine` service and boots the backend + Vite dev servers natively, then runs Playwright chromium-only with `--workers=100%`. On failure it uploads the HTML report + traces (`frontend/playwright-report/`, `frontend/test-results/`) as an artifact. It is **not** a required check yet — it soaks first before gating merges.

`typecheck` is the quick way to catch the schema/shape-drift class that `lint`/`test` miss (vitest transpiles via esbuild and does **not** type-check). Run it — root, or `-w frontend` / `-w backend` for one workspace — after touching frontend/backend code, before declaring the change done. It's the same `tsc --noEmit` the `pre-push` hook runs, just on demand mid-change.

Both workspaces use a `@/*` → `src/*` path alias for cross-directory imports (frontend via Vite; backend via tsconfig `paths`, resolved by `tsx` in dev, **`tsc-alias`** in the build, and vitest `resolve.alias`). Because Node can't resolve a bare `@/` at runtime, the backend `build` is `tsc && tsc-alias` — `tsc-alias` rewrites every `@/…` back to a relative specifier in `dist/`. **Prod-safety guard:** after `npm run build -w backend`, `! grep -rlE 'from "@/|import\("@/' backend/dist` must be empty (an alias leaking into `dist` would crash `node dist/index.js`).

## Guardrails (local git hooks)

[lefthook](https://lefthook.dev) runs fast, infra-free gates before code reaches CI. Hooks install automatically via the root `prepare` script on `npm install` — config is `lefthook.yml`.

| Hook | Runs | Why |
|---|---|---|
| `pre-commit` | `eslint --fix` on staged `*.{ts,tsx}`; `fallow audit` on changed files | catch + auto-fix lint before it lands; fallow gates NEW dead code / complexity / duplication (config `.fallowrc.jsonc`; skips silently when `fallow` isn't installed — `npm i -g fallow`) |
| `pre-push` | `tsc --noEmit` + (frontend) unit tests | the **tsc** gate is the key one — vitest transpiles via esbuild and does NOT type-check, so type-only errors otherwise only surface in CI's `build` job |

Jobs are **scoped per workspace** via lefthook `root:` — a backend-only push runs `typecheck-backend` and skips the frontend jobs (and vice-versa), since the two workspaces share no types. The first push of a brand-new branch can't resolve a file range, so it skips (CI is the backstop); subsequent pushes gate normally.

Backend vitest stays **CI-only** (it needs Postgres) so pre-push never blocks on a DB. **Do not bypass with `--no-verify`** — fix the failure. Run a hook manually with `npx lefthook run pre-commit` / `pre-push`.

## Running outside Docker (faster iteration)

```bash
# Start just Postgres:
docker compose up db -d

# Backend:
cd backend
cp .env.example .env          # set DATABASE_URL if not done
npm install
npm run dev                   # tsx watch src/index.ts

# Frontend (separate terminal):
cd frontend
npm install
npm run dev                   # vite; VITE_API_URL defaults to http://localhost:4000/api
```

## Environment variables

| Var | Where | Default |
|---|---|---|
| `DATABASE_URL` | `backend/.env` | `postgresql://character_sheet:character_sheet@localhost:5432/character_sheet` |
| `VITE_API_URL` | `frontend/.env` or shell | `http://localhost:4000/api` |

## Prisma workflow

All Prisma commands run from `backend/` with `DATABASE_URL` set:

```bash
cd backend

# After a fresh clone or any schema change:
npx prisma generate            # regenerates src/generated/prisma (gitignored)

# Create a new migration (dev only):
npx prisma migrate dev --name describe_the_change

# Apply pending migrations (what the container does):
npx prisma migrate deploy

# Re-seed (idempotent, safe to run any time):
npx prisma db seed
```

`schema.prisma` lives at `backend/prisma/schema.prisma`. The `prisma.config.ts` at the backend root tells the CLI where to find it.

## Verification data (`seed:verify`)

The catalog seed creates no users/characters, and OAuth can't complete headless or on a worktree port. `npm run seed:verify` bridges that gap for UI verification: against a **running** stack it mints a session via the guarded `POST /api/auth/dev-login` endpoint and builds a representative character ("Verify Dummy" — equippable weapon + armor, trinkets, a bulk sale) through the real API endpoints, then prints the `cs_session` cookie + frontend URL. It's idempotent (reuses an existing "Verify Dummy").

```bash
npm run seed:verify                                  # default localhost:4000 / :5173
BACKEND_URL=http://localhost:4010 \
FRONTEND_URL=http://localhost:5183 npm run seed:verify   # a worktree slot
```

Requires `ALLOW_DEV_LOGIN=true` (the dev compose sets it by default; it is **hard-disabled when `NODE_ENV=production`**, so it can never expose a passwordless login in prod). To sign in from Playwright, run an in-page `fetch('/api/auth/dev-login', { method: 'POST' })` then reload — `cs_session` is HttpOnly so it can't be set from `document.cookie`. The `verify-frontend` skill automates this.

## Parallel worktrees (build several features at once)

`.claude/skills/worktree/worktree.sh` runs an **isolated, fully-dockerized stack per git worktree** so multiple branches can run and be tested at the same time. Each worktree gets a port "slot" (1–9; slot 0 = this main checkout on default ports). Everything is derived from the slot:

| Var (slot N) | Formula | Slot 1 |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `cs-<sanitized-branch>` | `cs-spell-upcasting` |
| `BACKEND_PORT` | `4000 + N*10` | `4010` |
| `FRONTEND_PORT` | `5173 + N*10` | `5183` |
| `POSTGRES_PORT` | `5432 + N*10` | `5442` |
| `VITE_API_URL` | `http://localhost:${BACKEND_PORT}/api` | `…:4010/api` |

A distinct `COMPOSE_PROJECT_NAME` gives each worktree its **own** `postgres_data`/`node_modules` volumes — so a migration in one worktree is invisible to the others. The slot↔branch map persists in `.claude/worktrees/registry.json` (gitignored); the per-worktree `.env` is generated, never committed.

```bash
./.claude/skills/worktree/worktree.sh create <branch> --up   # worktree under .claude/worktrees/<branch>, assign slot, build & start
./.claude/skills/worktree/worktree.sh ls                      # table: branch | slot | URLs | running status
./.claude/skills/worktree/worktree.sh up|down <branch>        # start / stop (down keeps the DB volume)
./.claude/skills/worktree/worktree.sh rm <branch>             # down -v + remove worktree + free the slot
docker compose ls                             # all running stacks across worktrees, built-in
docker compose -p cs-<branch> logs -f         # tail one worktree's stack
```

To work inside a worktree, `cd .claude/worktrees/<branch>` (a normal checkout on its own branch + ports) and run commands there, or open a separate `claude` session in that directory. There is also a `worktree` skill that wraps this.

> **pgAdmin is opt-in.** It now sits behind the `tools` Compose profile, so neither the main stack nor worktrees start it by default. To inspect a DB visually: `docker compose --profile tools up pgadmin` (main checkout → port 5050; a worktree → `5050 + slot*10`).

## How to add a new domain / feature

This is the repeatable pattern established by inventory → HP → XP → spellcasting:

### 1. Schema + migration
Add the model(s) and/or enum values to `backend/prisma/schema.prisma`, then:
```bash
cd backend && npx prisma migrate dev --name add_<domain>
npx prisma generate
```
Additive changes (new model, new enum value via `ALTER TYPE ADD VALUE`) are safe to deploy without backfill.

### 2. Rules data (if any)
If the feature has 5e rules logic, add it to `backend/src/lib/srd.ts` (or `experience.ts` for XP math). Never inline rules in a route or duplicate them on the frontend.

> **Level-gated feature?** If the feature's availability or count depends on character level (feats, ASI, subclass unlocks, etc.), follow the reconciliation pattern in `docs/leveling.md` in addition to this recipe. The transaction-handler checklist below still applies, but you also need a reconciler + read-clamp.

### 3. `lib/<domain>.ts` — operation handler
- Define op types (discriminated union) and any domain errors (`class FooError extends Error {}`).
- `export async function apply<Domain>Operations(characterId, ops)`: one `randomUUID()` batchId → `prisma.$transaction` → per-op: validate, mutate, `logEvent(tx, { category, type, summary, before, after, batchId })`.
- Throw domain errors for invalid ops (the route catches them → 400).

See `lib/inventory/inventory.ts` as the reference.

### 4. `routes/<domain>.ts` — endpoint
```typescript
router.post("/characters/:id/<domain>/transactions", async (req, res) => {
  const char = await prisma.character.findUnique(...);
  if (!char) return res.status(404).json({ error: "Not found" });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "..." });
  try {
    await apply<Domain>Operations(char.id, parsed.data.operations);
  } catch (err) {
    if (err instanceof DomainError) return res.status(400).json({ error: err.message });
    throw err;
  }
  const updated = await prisma.character.findUniqueOrThrow({ where: { id: char.id }, ...characterInclude });
  res.json(serializeCharacter(updated));
});
```

Mount in `backend/src/app.ts`: `app.use("/api", <domain>Router)`.

### 5. `frontend/src/api/client.ts` — new function
```typescript
export async function apply<Domain>Transactions(characterId, operations): Promise<Character> {
  const response = await fetch(`${API_URL}/characters/${characterId}/<domain>/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Failed (${response.status})`);
  }
  return response.json();
}
```

### 6. Component(s)
Follow the orchestrator/row pattern: one orchestrator component owns state + API calls + `onUpdate` → re-renders; row components are presentational with callbacks. See `InventoryList`/`InventoryRow` or `SpellsSection`/`SpellRow`.

### 7. Tests
Mirror `routes/__tests__/inventory.test.ts` for the route; add lib-level unit tests if the domain has non-trivial pure logic.

### Catalog-table decision checklist
Ask: does this feature need a **baseline list for players to pick from** (vs. hand-authoring every entry)?
- Yes → add a catalog table (like `Spell`, `Item`, `Race`, `CharacterClass`). Put the seed rows in a pure data-only module under `prisma/seed/*.ts` (no Prisma import — see `prisma/seed/spells.ts`, `catalog-data.ts`) and upsert them from `prisma/seed.ts`, which stays at that path (required by `prisma.config.ts`) as the upsert entrypoint. Expose it via `GET /api/<domain-plural>`.
- No → skip the catalog table (like `JournalEntry`).

Spells needed a catalog (picker UX); journal entries didn't (no baseline list). When in doubt: compare to `Spell` (flat, no detail table because spells aren't category-polymorphic) vs `Item` (category-polymorphic → needs `*WeaponDetail`/etc.).
