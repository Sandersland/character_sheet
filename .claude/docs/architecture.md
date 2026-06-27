# Architecture

## Backend (`backend/src`)

### Router map — all mounted under `/api` in `app.ts`

*Source of truth: `backend/src/app.ts` mounts — regenerate this table from there if it looks stale.*

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
| `routes/resources.ts` | `POST /characters/:id/resources/transactions` — batch resource/maneuver ops (spend/restore, learn/forget) |
| `routes/conditions.ts` | `POST /characters/:id/conditions/transactions` — apply/remove conditions, set exhaustion |
| `routes/class.ts` | `POST /characters/:id/class/transactions` — post-creation subclass + fighting-style selection |
| `routes/maneuvers.ts` | `GET /maneuvers` — Battle Master maneuver catalog |
| `routes/feats.ts` | `GET /feats` — feat catalog |
| `routes/advancement.ts` | `POST /characters/:id/advancement/transactions` — take/remove ASIs and feats |
| `routes/actions.ts` | `GET /actions` (catalog), `POST /characters/:id/actions/transactions` — apply an action's resource/quantity/heal effects |
| `routes/journal.ts` | `POST /characters/:id/journal`, `PATCH /characters/:id/journal/:entryId`, `DELETE /characters/:id/journal/:entryId` |
| `routes/sessions.ts` | `POST /characters/:id/sessions` (start), `POST …/sessions/:sessionId/end`, `GET …/sessions`, `GET …/sessions/active`, `GET …/sessions/:sessionId`, `POST …/sessions/:sessionId/combat/start`, `…/combat/end`, `…/combat/round`, `…/roll` (log an attack/damage roll) |

`characters.ts` exports `characterInclude` and `serializeCharacter`; every other mutation router imports and calls them to return the same full-character wire shape after applying changes.

### `lib/` — domain logic

*Source of truth: `ls backend/src/lib/`.*

| File | Responsibility |
|---|---|
| `lib/prisma.ts` | Singleton `PrismaClient` with `@prisma/adapter-pg` (required for Prisma 7). Reads `DATABASE_URL`. |
| `lib/logger.ts` | Pino structured logger + `httpLogger` (pino-http) request-logging middleware. JSON in prod, pretty in dev, silent under test. Level via `LOG_LEVEL`; redacts auth/cookie/password fields. |
| `lib/error-handler.ts` | Terminal Express error middleware (`errorHandler`). Turns uncaught/async route throws into a consistent `{ error }` JSON response; preserves an intentional `status`/`statusCode`; hides 500 detail in prod; logs server-side via the logger. Mounted last in `app.ts`. |
| `lib/security.ts` | `securityHeaders(servesStatic)` (helmet; CSP tuned for the SPA in single-origin mode) + `globalRateLimiter`/`creationRateLimiter` (express-rate-limit, `RATE_LIMIT_*` env knobs, auto-off under test). Mounted high in `app.ts`. |
| `lib/events.ts` | `logEvent(tx, params)` — writes one `CharacterEvent` + per-field `CharacterEventField` diffs inside the caller's transaction. `EventCategory`/`EventType` type unions. |
| `lib/srd.ts` | **All 5e rules data**: alignments, skills, ability-modifier math, `SPELLCASTING_ABILITY`, `FULL_CASTER_SLOTS`, `deriveCreatedCharacter()`, `deriveSpellcasting()`, `deriveWeaponAttackBonus()`, `deriveWeaponDamage()` (grip-aware: versatile die when off-hand is free). **This is the only permitted location for rules data.** |
| `lib/class-features.ts` | Class features + trackable resources for all base classes/subclasses (extracted from `srd.ts`). `deriveResources()` — the non-slot analog to `deriveSpellcasting()` (superiority dice, ki, rage). Pure, called inside `serializeCharacter`. |
| `lib/starting-equipment.ts` | `STARTING_EQUIPMENT` per-class packages + choice-group/open-pick structure surfaced via `GET /reference`. (Pack contents themselves are DB-backed; this is the choice scaffolding.) |
| `lib/experience.ts` | Pure XP-curve math (no DB): `XP_THRESHOLDS`, `levelForExperience`, `proficiencyBonusForLevel`, `experienceProgress`. |
| `lib/experience-ops.ts` | `applyExperienceOperations()` — transactional XP handler. Also `revertLevelUps()` (auto-reverses HP/dice when XP drops derived level). Calls `reconcileLevelGatedState` after each op. |
| `lib/level-reconciliation.ts` | Level-gated state registry. `reconcileLevelGatedState(ctx)` runs `LEVEL_GATED_RECONCILERS` in order (`reconcileSubclass` → `reconcileManeuvers` → `reconcileToolProficiencies` → `reconcileFightingStyle` → `reconcileAdvancements`) inside the XP transaction. Add new reconcilers here when shipping level-gated features. See `.claude/docs/leveling.md`. |
| `lib/advancement.ts` | `applyAdvancementOperations()` — take/remove ASIs and feats; persists the `advancements[]` array (in `resources` JSON) plus the side-effected `abilityScores`/`hitPoints`/`initiativeBonus` columns atomically. |
| `lib/hitpoints.ts` | HP domain: shapes, normalizers, pure rules helpers, `applyHitPointOperations()`. LongRest also resets spell slots in the same transaction. |
| `lib/spellcasting.ts` | `SpellEntry`/`SpellcastingMutableState` shapes, `normalizeSpellcastingMutable()` (handles compact + legacy JSON formats), `applySpellcastingOperations()`. |
| `lib/resources.ts` | `applyResourceOperations()` — spend/restore class resources and learn/forget maneuvers + tool profs; persists `used` counts and known lists in `resources` JSON. Analog to `spellcasting.ts`. |
| `lib/conditions.ts` | `applyConditionsOperations()` — apply/remove standard 5e conditions and set exhaustion; persists the `conditions` JSON column. Pure mutable state (not level-derived). |
| `lib/class.ts` | `applyClassOperations()` — post-creation subclass and fighting-style selection (`setSubclass`, `setFightingStyle`); fills the gap PATCH and creation don't cover. |
| `lib/actions.ts` | `DERIVED_ACTIONS` + `deriveActions()` (filters the action catalog for a character's class/level/subclass, called from `serializeCharacter`) and `ACTION_EFFECT_FN` dispatch table for applying an action's effects. |
| `lib/inventory.ts` | Currency math, catalog→snapshot builders, `applyInventoryOperations()`. Reference implementation for the intent-bearing transaction pattern. Includes the `setEquipped` op (logged as `equipped`/`unequipped` events). |
| `lib/itemDetail.ts` | `serializeWeaponDetail`/`serializeArmorDetail`/`serializeConsumableDetail` — shared by both `routes/items.ts` (catalog) and `routes/characters.ts` (inventory rows). |
| `lib/sessions.ts` | `startSession`, `endSession`, `getActiveSessionId`. Enforces single-active-session per character. Called by session routes and by `getActiveSessionId()` which is threaded into every `apply*Operations()` lib function to tag events. |
| `lib/session-summary.ts` | `computeSessionSummary()` — pure aggregation of a session's `CharacterEvent` rows into an end-of-session summary. No new bookkeeping; derive-don't-persist. Unit-testable without Postgres. |

Prisma client is generated into `src/generated/prisma` (gitignored). Run `npx prisma generate` from `backend/` after a fresh clone or any schema change.

---

## Frontend (`frontend/src`)

### Pages and routes (`App.tsx`)

| Route | Page | Notes |
|---|---|---|
| `/` | `CharacterListPage` | Grid of `CharacterCard`s + "new" card |
| `/characters/new` | `CharacterCreatePage` | Staged in `localStorage` until save; registered before `:id` so it isn't swallowed |
| `/characters/:id` | `CharacterSheetPage` | Reference sheet — what you'd print. No roll buttons. |
| `/characters/:id/session` | `SessionPage` | Live-play mode. Requires an active `Session`; auto-bounces to the sheet if none found. |

**`CharacterSheetPage` layout (printed-sheet order, top to bottom):**
Header (+ "Start Session" / "Resume Session" button) → `VitalsStrip` → `HitPointTracker` + `ExperienceTracker` (2-col) → ability rail + `SkillsTable` (auto/1fr) → `ProficienciesCard` → `ClassFeaturesSection` → `AdvancementSection` → `InventoryList` + Spells / Journal (2-col) → Journal (if spellcaster, full-width).

**`SessionPage` layout (action-first, top to bottom):**
Header (character identity + "End Session" button) → `HitPointTracker` → Attacks card (equipped weapons only, Attack + Damage roll buttons with correct versatile die) → `ClassFeaturesSection` (resource pools) → `InventoryList`.

### `api/client.ts`

The only permitted backend-call site. Every exported function maps to one endpoint. Key ones:

- `applyHitPointOperations`, `applyExperienceOperations`, `applyInventoryTransactions`, `applySpellcastingTransactions` — intent-bearing batch endpoints (inventory includes `setEquipped` op)
- `fetchActivity`, `revertBatch` — unified audit log
- `fetchReference`, `fetchItems`, `fetchSpells` — catalog reads
- `updateCharacter` — thin PATCH, `currency` only
- `startSession`, `endSession`, `fetchActiveSession`, `fetchSessions`, `fetchSession` — session lifecycle

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

*Source of truth: Character model in `schema.prisma`.* (Journal is **not** a JSON column — it's a separate `JournalEntry` table.)

The Character row carries these JSON columns: `hitPoints`, `hitDice`, `abilityScores`, `skills`, `toolProficiencies`, `currency`, `spellcasting?`, `resources?`, `conditions?`. Notable ones:

- `spellcasting Json?` — mutable state only: `{ slotsUsed, arcanumUsed, spells: SpellEntry[], concentratingOn }`. Slot totals/DC/attack/ability are derived at read time by `deriveSpellcasting()` in `serializeCharacter`. `normalizeSpellcastingMutable()` handles legacy blobs.
- `resources Json?` — mutable state only: `{ used, maneuversKnown, toolProficienciesKnown, advancements, fightingStyle }`. Pool totals/die/recharge and all level-gated caps are derived at read time via `deriveResources()`; the persisted lists are clamped-on-read.
- `conditions Json?` — `{ active: ConditionEntry[], exhaustion: number }`. Pure mutable state, not level-derived.
- `currency Json` — the **only** JSON column still patchable via `PATCH /characters/:id`. Every other column above mutates exclusively through its domain's `…/transactions` endpoint.

### Unified audit log

`CharacterEvent` + `CharacterEventField` in `schema.prisma`:

- **Single-Table Inheritance**: `category` + `type` discriminators. Full `EventCategory` set (source of truth: `lib/events.ts`): `inventory`, `hitPoints`, `experience`, `currency`, `spellcasting`, `class`, `resources`, `advancement`, `session`, `combat`, `conditions`.
- **Polymorphic soft-reference**: `entityType`/`entityId` (no FK — the entity may be deleted).
- **before/after JSON snapshots**: the state before and after the operation, used by the revert handler to restore.
- **Append-only**: events are flagged `reverted:true`, never deleted. A `revert` meta-event is appended on undo.
- **Session tagging**: `sessionId String?` — events fired while a session is active get its id. Between-session events (shopping, leveling between adventures) get `null`. `getActiveSessionId(characterId)` is called at the top of every `apply*Operations()` function.

`logEvent(tx, params)` in `lib/events.ts` writes the event + computes `CharacterEventField` diffs (via `diffToFields`) inside the caller's `$transaction`. All ops in a single request share a `randomUUID()` `batchId`.

Undo: `POST /characters/:id/events/:batchId/revert` in `routes/activity.ts`. LIFO-only (returns 409 if not the most-recent non-reverted batch). Restores `before` snapshots in a transaction; inventory undo is intentionally deferred. **The LIFO guard skips events from ended sessions** (`OR: [{ sessionId: null }, { session: { status: "active" } }]`) — a closed session's history is frozen and cannot be undone.

### Intent-bearing transaction pattern

Every mutable domain follows the same shape:

1. **Zod discriminated-union** per op type in the route (e.g. `castSpell | expendSlot | …`)
2. **`apply*Operations(characterId, ops)`** in `lib/` — one `prisma.$transaction`, applies ops in order, calls `logEvent` per meaningful op with shared `batchId`
3. **Route** calls the lib function, catches domain errors → 400, re-fetches and returns `serializeCharacter`

`lib/inventory.ts` is the reference implementation. Do not add new mutable domains via `PATCH /characters/:id`.

---

## Docker Compose

Four services: `db` (Postgres 17, port 5432), `pgadmin` (port 5050), `backend` (Express, port 4000), `frontend` (Vite, port 5173). Each of backend/frontend has its own `Dockerfile` with source bind-mounted for hot reload and an anonymous volume shadowing `node_modules`. No shared root Dockerfile — they're independent npm packages; the root workspaces setup is for local fanning-out only, not containers.
