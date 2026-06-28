# Testing

> **Tests don't type-check.** Vitest transpiles with esbuild, which strips types
> without checking them, so a type-only error passes `npm test` and `npm run lint`
> but breaks the production `tsc` build (and the Railway deploy). The CI `build`
> job (`.github/workflows/ci.yml`) is the type gate — run `npm run build` locally
> before pushing if you've changed type-significant code or test signatures.

## Running tests

```bash
# All tests (both workspaces):
docker compose up db -d
npm run test

# Backend only (needs Postgres running):
docker compose up db -d
npm run test -w backend

# Single backend test file:
cd backend && npx vitest run src/routes/__tests__/spellcasting.test.ts

# Frontend (no DB needed):
cd frontend && npx vitest run
```

> **Local setup**: `backend/.env` must exist and contain `DATABASE_URL`. Copy it from
> `.env.example` on a fresh clone: `cp .env.example backend/.env`. The vitest config
> (`backend/vitest.config.ts`) reads this file automatically via Vite's `loadEnv`, so
> no manual env-var export is needed. In CI, set `DATABASE_URL` as a real environment
> variable and it will take precedence over the file.

## Backend test structure

All backend route tests live in `backend/src/routes/__tests__/` and use:
- **`supertest`** against `createApp()` (imported from `app.ts`, which builds the Express app without binding a port)
- **Real Postgres** — tests hit the actual DB via Prisma; no mocks

### Standard fixture pattern

```typescript
beforeEach(async () => {
  // 1. Upsert any catalog rows the test needs (race, class, items, spells…)
  const cls = await prisma.characterClass.upsert({ where: { name: "Fixture Class" }, create: {...}, update: {} });
  // 2. Create the character fixture
  await prisma.character.create({ data: { ...FIXTURE_BASE, classEntries: { create: [...] } } });
});

afterEach(async () => {
  // Delete only what this test created — don't touch seeded rows
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

afterAll(async () => {
  // Clean up catalog fixtures — use uniquely-named rows, not seeded class names
  await prisma.characterClass.deleteMany({ where: { name: "Fixture Class" } });
});
```

### Fixture isolation gotcha (cautionary tale)

**Do not** `deleteMany` a seeded catalog row in `afterAll`. The seed creates shared rows (e.g., the "Wizard" `CharacterClass`); deleting them corrupts the DB for other test suites running in the same vitest process.

**The fix**: use a **uniquely-named** fixture row that won't conflict with the seed (e.g. `"Spellcasting Route Test Wizard"` instead of `"Wizard"`). The `CharacterClassEntry` *snapshot* `name` field is what business logic reads (e.g. `deriveSpellcasting` lowercases it), so you can safely set the entry name to `"wizard"` while the catalog row has a unique test-only name:

```typescript
// Catalog row: unique name so afterAll delete is safe
await prisma.characterClass.upsert({ where: { name: "My Test Wizard Class" }, create: { name: "My Test Wizard Class", ... } });

// Class entry: snapshot name = "wizard" so deriveSpellcasting("wizard") matches
classEntries: { create: [{ name: "wizard", classId: cls.id, position: 0 }] }
```

If you accidentally delete a seeded row, restore it:
```bash
cd backend && npx prisma db seed
```

### Parallel test isolation (one shared DB)

Vitest runs test **files in parallel** (no `fileParallelism` override — and don't add one; the speed matters), but every file hits **one shared Postgres**. Each suite deletes only its own rows in `afterEach`, so at any instant the tables hold the **union of every currently-running suite's live fixtures** — a set that churns as siblings create and tear down. Two rules keep that safe:

1. **Unique, file-prefixed fixture IDs + a per-file owner.** Prefix fixture ids with the file's domain (`test-activity-1`, `test-sessions-1`, …) and own them with `ensureTestOwner("owner-<domain>")` (`backend/src/test-support/owner.ts`). Distinct ids per file mean two suites never write the same row.

2. **Never assert on an unscoped/global collection — scope to your own fixture.** A bare list endpoint (`GET /api/characters`) returns *everyone's* fixtures, so its length and membership change mid-test. Don't compare two whole-list snapshots, and don't assert exact length/membership of an unscoped list. Instead find your own row and assert on it:

```typescript
import { findInList } from "../../test-support/list.js";

// eslint-disable-next-line no-restricted-syntax -- lists all, asserts only on own fixture
const res = await supertest(createApp()).get("/api/characters");
const mine = findInList(res.body, FIXTURE.id);   // not res.body.length / toEqual(wholeList)
expect(mine).toBeDefined();                      // clear "fixture not found" message
expect(mine).toMatchObject({ name: "Test Fixture", level: 3 });
```

The healthy reference is the `GET /api/characters returns summaries…` test in `characters.test.ts`. The anti-pattern — comparing an unfiltered and a filtered `GET /api/characters` snapshot for equality — flaked PR #134 in CI and is the subject of #135. A `no-restricted-syntax` eslint rule (`backend/eslint.config.js`, scoped to `__tests__`) flags reads of the unscoped `/api/characters` list as a backstop, so a new suite must consciously scope (or disable with a reason). (Scoped sub-resources like a single character's `res.body.inventory` are fine — they belong to your fixture.)

> **Connection teardown.** `backend/vitest.setup.ts` ends each file's Prisma pool in `afterAll` (`prisma.$disconnect()` + `pool.end()`). Without it, pooled sockets linger after a file finishes and have surfaced as an intermittent "socket hang up" under parallel load. `prisma.$disconnect()` alone does **not** end the externally-supplied `pg.Pool` — hence the explicit `pool.end()` (the pool is exported from `lib/prisma.ts` for exactly this).

### 400 vs 404 pattern

Every transaction endpoint should have:
- One test for 404 (unknown character id)
- One test for 400 on malformed body (invalid `type` in operations array)
- One test each for every domain error case (slot exhausted, duplicate learn, etc.)

### Atomic batch test

Always add a multi-op atomicity test: a second op that fails should roll back the first:
```typescript
it("batch is atomic", async () => {
  await supertest(app).post(url).send({
    operations: [
      { type: "validOp" },       // would succeed alone
      { type: "validOp", id: "does-not-exist" }, // fails → rolls back first
    ]
  });
  expect(res.status).toBe(400);
  // assert character state is unchanged
});
```

## Frontend tests

No DB needed. Run with `cd frontend && npx vitest run`.

### Setup

`vite.config.ts` carries the `test` block (`environment: "jsdom"`, `setupFiles: ["./src/test/setup.ts"]`, `globals: false`). Vitest inherits the `@/` alias from the same config. `src/test/setup.ts` registers jest-dom matchers and runs RTL `cleanup()` after each test. Test deps: `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@testing-library/dom`.

### Two flavors — both colocated next to their source file (no `__tests__/` subdirectory)

**Pure logic / fetch-mock → `*.test.ts`**

```ts
// src/lib/dice.test.ts — no DOM, no React
import { describe, it, expect } from "vitest";
import { rollSpec } from "@/lib/dice";
```

Examples: `src/api/client.test.ts` (mocks `fetch`, tests all client functions), `src/lib/dice.test.ts`, `src/lib/abilityGen.test.ts`.

**Component render tests → `*.test.tsx`** (next to the component)

```tsx
// src/features/inventory/InventoryRow.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InventoryRow from "@/features/inventory/InventoryRow";
```

Examples: `src/components/ui/Modal.test.tsx` (portal, focus trap, Esc/backdrop/Close, body overflow, focus restore), `src/features/spells/SpellRow.test.tsx` (callback assertions + typed fixture).

### Conventions

**`globals: false`** — always import explicitly from `"vitest"`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
```

**Query by accessible role/name** where possible — it tests what the user actually sees:
```ts
screen.getByRole("button", { name: "Cast" })
screen.getByRole("meter")
screen.getByRole("dialog")
```

**Two gotchas from the existing suite:**
- An `<img alt="">` has ARIA role `presentation`, not `img` — query it with `container.querySelector("img")` instead of `getByRole("img")`.
- A button's accessible name comes from its text content, not its `title` attribute — use the text (e.g. `"Cast"`, not `"Cast Fireball"`).

**Router-dependent components** — wrap in `MemoryRouter`:
```tsx
render(<MemoryRouter><CharacterCard character={base} /></MemoryRouter>);
```

**Domain component fixtures** — build a fully-typed fixture object at the top of the test file, then spread-override per test:
```ts
const base: InventoryItem = { id: "item-1", name: "Club", category: "weapon", quantity: 1, equipped: false };
renderRow({ item: { ...base, equipped: true } });
```

**Interaction** — use `userEvent.setup()` for clicks, typing, and keyboard events that involve real browser-like sequencing; use `fireEvent` only for low-level event injection (e.g. `fireEvent.keyDown(document, { key: "Escape" })` in Modal tests).

## Browser / UI verification (behind auth)

Unit tests mock the network, but driving the real UI in a browser hits `requireAuth` — a fresh stack shows the `LoginPage` and OAuth can't complete headless. To get a signed-in session with something to look at:

1. Bring the stack up and wait for `/api/health`.
2. `npm run seed:verify` — mints a session via `POST /api/auth/dev-login` and builds a representative "Verify Dummy" character through the real endpoints (idempotent). Needs `ALLOW_DEV_LOGIN=true` (dev compose default). See development.md.
3. In Playwright, sign in with an in-page `fetch('/api/auth/dev-login', { method: 'POST' })` then reload (`cs_session` is HttpOnly, so it can't be set from `document.cookie`).

The **`verify-frontend` skill** automates all of this (seed → sign in → run RTL tests + browser verification in parallel). e2e Playwright coverage of full flows is tracked in #97.

## Lib-level unit tests

Pure domain logic goes in `backend/src/lib/__tests__/`:
- `experience.test.ts` — XP table, level derivation
- `hitpoints.test.ts` — HP math, death saves, rest
- `inventory.test.ts` — currency math, operation handler

Add new `lib/__tests__/<domain>.test.ts` for any non-trivial pure logic in a new domain handler.
