# Testing

## Running tests

```bash
# All tests (both workspaces):
npm run test

# Backend only (needs Postgres running):
docker compose up db -d
cd backend && DATABASE_URL="postgresql://character_sheet:character_sheet@localhost:5432/character_sheet" npx vitest run

# Single backend test file:
cd backend && DATABASE_URL="postgresql://character_sheet:character_sheet@localhost:5432/character_sheet" npx vitest run src/routes/__tests__/spellcasting.test.ts

# Frontend (no DB needed):
cd frontend && npx vitest run
```

> **Critical**: `DATABASE_URL` must be set **in the same command** as `vitest`. A separate `cd` then `export DATABASE_URL` does not propagate correctly when the two commands are chained differently — use `cd backend && DATABASE_URL=… npx vitest` on one line.

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

Located in colocated `*.test.ts` files (no `__tests__/` subdirectory):
- `src/api/client.test.ts` — mocks `fetch`, tests all client functions
- `src/lib/dice.test.ts` — pure unit tests for the dice engine
- `src/lib/abilityGen.test.ts` — pure unit tests for score generation

No DB needed. Run with `cd frontend && npx vitest run`.

## Lib-level unit tests

Pure domain logic goes in `backend/src/lib/__tests__/`:
- `experience.test.ts` — XP table, level derivation
- `hitpoints.test.ts` — HP math, death saves, rest
- `inventory.test.ts` — currency math, operation handler

Add new `lib/__tests__/<domain>.test.ts` for any non-trivial pure logic in a new domain handler.
