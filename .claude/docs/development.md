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

On every container start, the backend runs `prisma generate && prisma migrate deploy && prisma db seed` before starting `tsx watch`. All three are idempotent (migrate deploy no-ops if already applied; seed uses upserts). Three sample characters (a Fighter, a Cleric, and a Wizard) land automatically.

## Root scripts (fan out to both workspaces)

```bash
npm run dev       # backend (tsx watch) + frontend (vite) in parallel
npm run lint      # ESLint in each workspace
npm run test      # Vitest in each workspace
npm run build     # production build in each workspace
```

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

## Parallel worktrees (build several features at once)

`scripts/worktree.sh` runs an **isolated, fully-dockerized stack per git worktree** so multiple branches can run and be tested at the same time. Each worktree gets a port "slot" (1–9; slot 0 = this main checkout on default ports). Everything is derived from the slot:

| Var (slot N) | Formula | Slot 1 |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `cs-<sanitized-branch>` | `cs-spell-upcasting` |
| `BACKEND_PORT` | `4000 + N*10` | `4010` |
| `FRONTEND_PORT` | `5173 + N*10` | `5183` |
| `POSTGRES_PORT` | `5432 + N*10` | `5442` |
| `VITE_API_URL` | `http://localhost:${BACKEND_PORT}/api` | `…:4010/api` |

A distinct `COMPOSE_PROJECT_NAME` gives each worktree its **own** `postgres_data`/`node_modules` volumes — so a migration in one worktree is invisible to the others. The slot↔branch map persists in `.claude/worktrees/registry.json` (gitignored); the per-worktree `.env` is generated, never committed.

```bash
./scripts/worktree.sh create <branch> --up   # worktree under .claude/worktrees/<branch>, assign slot, build & start
./scripts/worktree.sh ls                      # table: branch | slot | URLs | running status
./scripts/worktree.sh up|down <branch>        # start / stop (down keeps the DB volume)
./scripts/worktree.sh rm <branch>             # down -v + remove worktree + free the slot
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

> **Level-gated feature?** If the feature's availability or count depends on character level (feats, ASI, subclass unlocks, etc.), follow the reconciliation pattern in `.claude/docs/leveling.md` in addition to this recipe. The transaction-handler checklist below still applies, but you also need a reconciler + read-clamp.

### 3. `lib/<domain>.ts` — operation handler
- Define op types (discriminated union) and any domain errors (`class FooError extends Error {}`).
- `export async function apply<Domain>Operations(characterId, ops)`: one `randomUUID()` batchId → `prisma.$transaction` → per-op: validate, mutate, `logEvent(tx, { category, type, summary, before, after, batchId })`.
- Throw domain errors for invalid ops (the route catches them → 400).

See `lib/inventory.ts` as the reference.

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
- Yes → add a catalog table (like `Spell`, `Item`, `Race`, `CharacterClass`). Seed it in `prisma/seed.ts` with upserts. Expose it via `GET /api/<domain-plural>`.
- No → skip the catalog table (like `JournalEntry`).

Spells needed a catalog (picker UX); journal entries didn't (no baseline list). When in doubt: compare to `Spell` (flat, no detail table because spells aren't category-polymorphic) vs `Item` (category-polymorphic → needs `*WeaponDetail`/etc.).
