# Architecture

## Backend (`backend/src`)

### Router map — all mounted under `/api` in `app.ts`

| File | Endpoints |
|---|---|
| `routes/health.ts` | `GET /health` |
| `routes/characters.ts` | `GET /characters`, `GET /characters/:id`, `POST /characters`, `PATCH /characters/:id`, `DELETE /characters/:id` |
| `routes/reference.ts` | `GET /reference` — race/class/background catalog + alignments + per-class starting equipment options |
| `routes/items.ts` | `GET /items` — item catalog with weapon/armor/consumable detail |
| `routes/hitpoints.ts` | `POST /characters/:id/hp` — batch HP ops |
| `routes/inventory.ts` | `POST /characters/:id/inventory/transactions`, `GET /characters/:id/inventory/transactions` |
| `routes/experience.ts` | `POST /characters/:id/experience` — batch XP ops |
| `routes/activity.ts` | `GET /characters/:id/activity`, `POST /characters/:id/events/:batchId/revert` |
| `routes/spells.ts` | `GET /spells` — spell catalog |
| `routes/spellcasting.ts` | `POST /characters/:id/spellcasting/transactions` — batch spell ops |

`characters.ts` exports `characterInclude` and `serializeCharacter`; every other mutation router imports and calls them to return the same full-character wire shape after applying changes.

### `lib/` — domain logic

| File | Responsibility |
|---|---|
| `lib/prisma.ts` | Singleton `PrismaClient` with `@prisma/adapter-pg` (required for Prisma 7). Reads `DATABASE_URL`. |
| `lib/events.ts` | `logEvent(tx, params)` — writes one `CharacterEvent` + per-field `CharacterEventField` diffs inside the caller's transaction. `EventCategory`/`EventType` type unions. |
| `lib/srd.ts` | **All 5e rules data**: alignments, skills, ability-modifier math, `SPELLCASTING_ABILITY`, `FULL_CASTER_SLOTS`, `STARTING_EQUIPMENT`, `PACK_CONTENTS`, `deriveCreatedCharacter()`, `deriveSpellcasting()`. **This is the only permitted location for rules data.** |
| `lib/experience.ts` | Pure XP-curve math (no DB): `XP_THRESHOLDS`, `levelForExperience`, `proficiencyBonusForLevel`, `experienceProgress`. |
| `lib/experience-ops.ts` | `applyExperienceOperations()` — transactional XP handler. Also `revertLevelUps()` (auto-reverses HP/dice when XP drops derived level). Calls `reconcileLevelGatedState` after each op. |
| `lib/level-reconciliation.ts` | Level-gated state registry. `reconcileLevelGatedState(ctx)` runs `LEVEL_GATED_RECONCILERS` in order (currently `reconcileSubclass` → `reconcileManeuvers`) inside the XP transaction. Add new reconcilers here when shipping level-gated features (feats, ASI, etc.). See `.claude/docs/leveling.md`. |
| `lib/hitpoints.ts` | HP domain: shapes, normalizers, pure rules helpers, `applyHitPointOperations()`. LongRest also resets spell slots in the same transaction. |
| `lib/spellcasting.ts` | `SpellEntry`/`SpellcastingMutableState` shapes, `normalizeSpellcastingMutable()` (handles compact + legacy JSON formats), `applySpellcastingOperations()`. |
| `lib/inventory.ts` | Currency math, catalog→snapshot builders, `applyInventoryOperations()`. Reference implementation for the intent-bearing transaction pattern. |
| `lib/itemDetail.ts` | `serializeWeaponDetail`/`serializeArmorDetail`/`serializeConsumableDetail` — shared by both `routes/items.ts` (catalog) and `routes/characters.ts` (inventory rows). |

Prisma client is generated into `src/generated/prisma` (gitignored). Run `npx prisma generate` from `backend/` after a fresh clone or any schema change.

---

## Frontend (`frontend/src`)

### Pages and routes (`App.tsx`)

| Route | Page | Notes |
|---|---|---|
| `/` | `CharacterListPage` | Grid of `CharacterCard`s + "new" card |
| `/characters/new` | `CharacterCreatePage` | Staged in `localStorage` until save; registered before `:id` so it isn't swallowed |
| `/characters/:id` | `CharacterSheetPage` | Main sheet; composes all section components |

**`CharacterSheetPage` layout (top to bottom):**
Header → `VitalsStrip` → `HitPointTracker` + `ExperienceTracker` (2-col) → ability rail + `SkillsTable` (2-col) → `InventoryList` + Spells Card / Journal Card (2-col) → Journal Card if spellcaster (full-width).

### `api/client.ts`

The only permitted backend-call site. Every exported function maps to one endpoint. Key ones:

- `applyHitPointOperations`, `applyExperienceOperations`, `applyInventoryTransactions`, `applySpellcastingTransactions` — intent-bearing batch endpoints
- `fetchActivity`, `revertBatch` — unified audit log
- `fetchReference`, `fetchItems`, `fetchSpells` — catalog reads
- `updateCharacter` — thin PATCH, `currency` only

### `lib/`

| File | Purpose |
|---|---|
| `dice.ts` | `RollSpec`, `rollSpec`, `summarizeRoll`, `formatRollSpec`. The **only** place `Math.random` is called for dice. |
| `abilities.ts` | `abilityModifier`, `formatModifier`, `skillBonus`, labels. |
| `abilityGen.ts` | Four score-generation methods as pure functions; delegates to `dice.ts`. |
| `timeline.ts` | `groupByBatch`, `formatBatchDate` — shared by `ActivityModal` and `LedgerModal`. |
| `startingEquipment.ts` | `PackageState`, `EquipmentDraft`, draft helpers, `draftToInput`, `rollGold`. |
| `dieFaces.ts`, `physicsDice.ts` | React-free three.js geometry and cannon-es physics for the 3D dice rollers. |

---

## Cross-cutting data patterns

### Catalog + per-character row

Two distinct approaches, both in play:

**Selection tables** (race/class/background): a nullable FK to the catalog *and* an own `name` snapshot. The character's displayed race/class/bg can drift from the catalog (homebrew, renamed) — the snapshot is the source of truth, the FK is just provenance. `serializeCharacter` flattens these back to the flat wire shape.

**Full snapshots** (inventory items, spells): at acquire/learn time, all catalog fields are copied into the per-character row (`InventoryItem`, spell `SpellEntry` in the JSON). After that, the catalog is ignored — the snapshot is fully self-contained and freely editable (e.g. "Club" → "Club +1"). No merge-with-catalog logic anywhere.

**Detail tables** (items only): `ItemWeaponDetail`/`ItemArmorDetail`/`ItemConsumableDetail` + their `InventoryWeapon/Armor/ConsumableDetail` snapshot mirrors. Spells are flat — school/level/effectKind/effectDice/scaling all on the `Spell` row directly, no detail table split needed.

**Dice fields**: decomposed as `...DiceCount`/`...DiceFaces`/`...Modifier` to match `dice.ts`'s `RollSpec` shape — never stored as `"1d6"` strings.

See `schema.prisma` model comments for the detailed snapshot-vs-overlay reasoning.

### JSON columns on Character

- `spellcasting Json?` — mutable state only: `{ slotsUsed: Record<string,number>, spells: SpellEntry[] }`. Slot totals/DC/attack/ability are derived at read time by `deriveSpellcasting()` in `serializeCharacter`. `normalizeSpellcastingMutable()` handles legacy blobs.
- `journal Json` — round-tripped opaquely.
- `currency Json` — the only JSON column still patchable via `PATCH /characters/:id`.

### Unified audit log

`CharacterEvent` + `CharacterEventField` in `schema.prisma`:

- **Single-Table Inheritance**: `category` (inventory/hitPoints/experience/currency/spellcasting) + `type` discriminators.
- **Polymorphic soft-reference**: `entityType`/`entityId` (no FK — the entity may be deleted).
- **before/after JSON snapshots**: the state before and after the operation, used by the revert handler to restore.
- **Append-only**: events are flagged `reverted:true`, never deleted. A `revert` meta-event is appended on undo.

`logEvent(tx, params)` in `lib/events.ts` writes the event + computes `CharacterEventField` diffs (via `diffToFields`) inside the caller's `$transaction`. All ops in a single request share a `randomUUID()` `batchId`.

Undo: `POST /characters/:id/events/:batchId/revert` in `routes/activity.ts`. LIFO-only (returns 409 if not the most-recent non-reverted batch). Restores `before` snapshots in a transaction; inventory undo is intentionally deferred.

### Intent-bearing transaction pattern

Every mutable domain follows the same shape:

1. **Zod discriminated-union** per op type in the route (e.g. `castSpell | expendSlot | …`)
2. **`apply*Operations(characterId, ops)`** in `lib/` — one `prisma.$transaction`, applies ops in order, calls `logEvent` per meaningful op with shared `batchId`
3. **Route** calls the lib function, catches domain errors → 400, re-fetches and returns `serializeCharacter`

`lib/inventory.ts` is the reference implementation. Do not add new mutable domains via `PATCH /characters/:id`.

---

## Docker Compose

Four services: `db` (Postgres 17, port 5432), `pgadmin` (port 5050), `backend` (Express, port 4000), `frontend` (Vite, port 5173). Each of backend/frontend has its own `Dockerfile` with source bind-mounted for hot reload and an anonymous volume shadowing `node_modules`. No shared root Dockerfile — they're independent npm packages; the root workspaces setup is for local fanning-out only, not containers.
