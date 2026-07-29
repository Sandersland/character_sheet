# Development

Read this when you need commands, the Prisma workflow, worktree stacks, or the add-a-domain recipe.

## Quickstart

```bash
npm ci                                       # once per clone
cp .env.example backend/.env                 # supplies DATABASE_URL
docker compose up -d db                      # Postgres :5432
cd backend && npx prisma generate && npx prisma migrate deploy && npx prisma db seed && cd ..
npm run dev                                  # backend :4000 + frontend :5173
docker compose --profile tools up pgadmin    # pgAdmin :5050 (opt-in)
```

**The app runs on the host; only Postgres and the Playwright e2e runner are containers (#1458).** The dev images existed to make `docker compose up` boot everything, and paid for it with `node_modules` volumes shadowing the source mount — the split that made host `tsc` check the wrong tree, hid `fallow` from lefthook, and cost a rebuild per dependency change. CI has always run this way (`ci.yml` boots the same servers on a bare runner with a Postgres service), so the containerless path is the tested one.

The seed is **catalog-only** (no users/characters); use `npm run seed:verify` for a signed-in user + representative character. After a schema change, re-run `prisma migrate deploy` yourself — nothing does it on boot any more.

`npm run dev` runs the two servers **concurrently** (`&` + `wait`); npm workspaces are otherwise sequential, so a plain `--workspaces` fan-out would start the backend's watcher and never reach Vite. The other root scripts (`lint | typecheck | test | build`) do fan out per workspace.

`typecheck` (`tsc --noEmit`) catches the shape-drift class that lint/test miss — vitest transpiles without type-checking. Run it after touching code, before declaring done.

Nothing loads `backend/.env` implicitly — Prisma 7 dropped it and `tsx` never did it. The backend `dev`/`seed:verify` scripts pass `--env-file-if-exists`, `prisma.config.ts` loads it itself, and Vite reads `frontend/.env` through `loadEnv`; drop any of them and host dev breaks while CI keeps working, because CI injects the variables directly (#1463). Vite also pins `strictPort`, so a busy port fails loudly instead of silently serving on the next one.

## Guardrails (lefthook)

Hooks install via the root `prepare` script; config is `lefthook.yml`.

- `pre-commit`: `eslint --fix` on staged files + `fallow audit` on changed files (gates new dead code / complexity / duplication / architecture-boundary violations; config `.fallowrc.jsonc`).
- `pre-push`: `tsc --noEmit` + frontend unit tests, scoped per workspace. Backend vitest stays CI-only (needs Postgres).
- `post-checkout`/`post-merge`: regenerate the Prisma client only when `schema.prisma`/migrations changed — the fix for stale-client `tsc` failures after a pull (`Property 'x' does not exist on type 'PrismaClient'`). Manual fix: `cd backend && npx prisma generate`.

**Don't bypass with `--no-verify`** — fix the failure, or suppress an adjudicated fallow finding inline (`// fallow-ignore-next-line complexity`) so the suppression is visible in the diff. CI re-runs the fallow audit as a required check plus two per-workspace `fallow health` gates (backend: complexity ceilings + `maxCrap 30` with real coverage; frontend: complexity-only) — a function over the bar fails CI until decomposed or suppressed with review.

## Prisma workflow

All from `backend/` (schema at `backend/prisma/schema.prisma`; `prisma.config.ts` points the CLI there):

```bash
npx prisma generate                          # after clone or any schema change
npx prisma migrate dev --name describe_it    # new migration (dev)
npx prisma migrate deploy                    # apply pending (what containers do)
npx prisma db seed                           # idempotent upserts
```

**Narrowing an enum: migrate the data, then the type.** Removing a value makes Prisma emit a `CREATE TYPE "X_new" AS ENUM (…)` swap whose `USING ("col"::text::"X_new")` cast **aborts on any row still holding a removed value** — and a failed migration then blocks every migration behind it (`docs/deployment.md`, "A failed migration blocks every later one"). So the same `migration.sql` must `UPDATE` those rows to a surviving value, or `DELETE` them as an explicit recorded decision, **above** the `CREATE TYPE`. `scripts/check-enum-narrowing.sh` enforces this in lefthook `pre-commit` and the CI `lint` job; where no row can hold a removed value, say why in the migration with a `-- enum-narrowing-reviewed: <reason>` line. Renaming a value counts as removing one. Widening is safe and ungated — Prisma emits `ALTER TYPE … ADD VALUE` for added values regardless of where they sit in the schema enum, never a swap.

## Verification data (`seed:verify`)

Against a **running** stack, mints a session via `POST /api/auth/dev-login` (requires `ALLOW_DEV_LOGIN=true`; hard-off in production) and builds a representative "Verify Dummy" character through the real endpoints; idempotent. Override `BACKEND_URL`/`FRONTEND_URL` for a worktree slot. From Playwright, sign in with an in-page `fetch('/api/auth/dev-login', { method: 'POST' })` then reload.

## Parallel worktrees

`.claude/skills/worktree/worktree.sh` runs an isolated dockerized stack per git worktree. Each worktree gets a port slot N (main checkout = slot 0): `BACKEND_PORT 4000+10N`, `FRONTEND_PORT 5173+10N`, `POSTGRES_PORT 5432+10N`, and its own `COMPOSE_PROJECT_NAME` → own DB/node_modules volumes (migrations in one worktree are invisible to others).

**Worktrees live beside the repo, not inside it (#1457)** — `../.character-sheet-worktrees/<branch>` by default, `CS_WORKTREE_DIR` to relocate, `worktree.sh dir` to ask. Nesting them under the checkout is what let Node resolve `node_modules` *upward* into the main tree, so a worktree with a missing or half-finished install type-checked green against dependencies it never had. The slot registry (`registry.json`) and the create mutex live in that same directory, so nothing about a worktree is repo state. Worktrees predating the move keep their slots and stay reachable by `rm`; `create` refuses them until you do.

```bash
./.claude/skills/worktree/worktree.sh create <branch> --up | ls | up <branch> | down <branch> | rm <branch>
./.claude/skills/worktree/worktree.sh prune [--yes]   # artifacts of worktrees already gone
./.claude/skills/worktree/worktree.sh dir             # where they are placed
docker compose -p cs-<branch> logs -f
```

`.claude/worktrees/` stays in `.git/info/exclude` (not `.gitignore`): Claude Code's own `EnterWorktree` still nests worktrees there and writes that exclude block itself, so deleting the line un-ignores its trees and the CLI restores it anyway. Those trees keep the upward-resolution problem — this repo's own tooling just no longer creates any.

**`create` installs into the worktree, and that is what makes host tooling trustworthy (#1452).** It runs `npm ci` plus `prisma generate` there, so the pre-commit gate — including `fallow` — runs on its merits inside the worktree. **`--no-verify` in a worktree no longer has a justification.** A worktree whose install is missing now fails loudly (unresolved imports) rather than borrowing the main checkout's.

`npm ci` runs the root `prepare` → `lefthook install`, which bakes an absolute path into `.git/hooks`, a directory every worktree *shares* ([lefthook #1398](https://github.com/evilmartians/lefthook/issues/1398)). `create` re-installs from the main checkout afterwards so the shim outlives the worktree; `LEFTHOOK=0` does **not** prevent this — it gates hook execution, not `lefthook install`.

Both dev images also carry `git` and a global `fallow` pinned to the root `devDependency` (#1450). Use the in-container run for CI parity, or when you want the audit against the same image CI-adjacent work uses:

```bash
docker compose exec -T backend  sh -c 'cd /app && fallow audit --base origin/staging --gate new-only --no-cache'
docker compose exec -T backend  sh -c 'cd /app/backend  && npx tsc --noEmit'
docker compose exec -T frontend sh -c 'cd /app/frontend && npx tsc --noEmit'
```

`cd /app` for fallow (it loads `.fallowrc.jsonc` from the repo root) but **never** for vitest — `/app` is the root, and running the suites there leaves the `@/` alias unresolved and fails every file. The in-container audit is a smoke gate, not a CI replacement: CI feeds fallow the Istanbul coverage artifact for exact CRAP, which a local run has no way to produce, so CRAP numbers differ there. Dead code, complexity and duplication match.

## How to add a new domain / feature

The repeatable pattern (inventory → HP → XP → spellcasting …):

1. **Schema + migration** — models/enums in `schema.prisma`, `migrate dev`, `generate`.
2. **Rules data** — 5e logic goes in `lib/srd/` (or `lib/leveling/experience.ts`). Level-gated? Also follow `docs/leveling.md` (reconciler + read-clamp).
3. **`lib/<domain>/…` operation handler** — op discriminated union + domain error classes + `apply<Domain>Operations`; delegate the transaction preamble to `runCharacterTransaction`. Reference: `lib/inventory/inventory.ts`.
4. **Route** — use `makeTransactionsEndpoint` (`lib/http/transactions-endpoint.ts`) unless the response shape is non-uniform; register the router in `routes/manifest.ts`.
5. **`api/<domain>.ts` function** — delegate to `postTransactions`/`request<T>` (from `api/http.ts`); `api/client.ts` re-exports it via `export *`, no edit needed there.

A class/subclass **ability** skips steps 4–5: add one `ABILITY_REGISTRY` entry (`lib/classes/ability-registry.ts`) keyed by its rules-module basename, and call the existing `applyAbilityTransactions` from the client. No route file, no manifest entry, no new client export (#1275).
6. **Component(s)** — orchestrator/row pattern (see `docs/frontend.md`).
7. **Tests** — mirror `routes/character/__tests__/inventory.test.ts`; lib unit tests for non-trivial pure logic.

**Catalog-table decision:** does the feature need a baseline list players pick from? Yes → catalog table + data-only seed module under `prisma/seed/*.ts` upserted from `prisma/seed.ts`, exposed via `GET /api/<plural>` (like `Spell`, `Item`). No → skip it (like `JournalEntry`). Category-polymorphic content needs detail tables (like `Item*Detail`); flat content doesn't (like `Spell`).

**A new subclass row** additionally needs a slug: add the new member to `SUBCLASS_SLUGS` and its identity to `SUBCLASS_IDENTITY` (`lib/classes/subclass-slug.ts`), the matching literal on the seed row (`prisma/seed/subclasses.ts`) and its `SubclassDefinition` (`lib/classes/<class>.ts`) — the bijection tests in `seed-data.test.ts` fail with a diff if any of the three is missing — four directional checks over the three sides (#1277).
