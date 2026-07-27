# Architecture

Read this when you need the cross-cutting data patterns (catalog+snapshot, JSON columns, audit log, transaction pattern) or the auth/ownership model. For inventories of what exists, read the code — it is the source of truth:

- **Routers:** registered in `backend/src/routes/manifest.ts` (`{ router, mount, scope }`), mounted by `app.ts`. Catalog/plain-REST routers mount at `/api`; character-scoped mutation routers mount on their owned sub-path under `/api/characters/:id` via `Router({ mergeParams: true })`.
- **Domain logic:** `ls backend/src/lib/` — domain folders (`auth`, `activity`, `srd`, `rules`, `classes`, `leveling`, `spellcasting`, `combat`, `inventory`, `character`, `session`, `campaign`, `core`, `http`).
- **Frontend routes:** `frontend/src/App.tsx`.
- **Schema:** `backend/prisma/schema.prisma` — model comments carry the per-model reasoning.

## Request pipeline & auth

`app.ts` mounts, in order: security headers → CORS → JSON body → logger → rate limiters → `healthRouter` → `authRouter` → **`requireAuth`** → every other router → optional SPA static → JSON 404 → terminal error handler. The public allowlist is exactly `/health` + `/api/auth/*`; everything else 401s without a session (including unknown `/api/*` paths, so existence isn't leaked).

Identity model: `User` (identity, no tokens) / `AuthAccount` (one row per linked sign-in method — tokens live here, never on `User`) / `AuthSession` (server-side session whose `id` **is** the opaque cookie token). All three cascade-delete with their `User`. Adding an OAuth provider = one `lib/auth/oauth/providers/<name>.ts` + a manifest entry + env vars; adding a non-OAuth method = a new `lib/auth/<method>/` sibling reusing session + cookies.

Ownership: `Character.ownerId` is a required FK. Every character-scoped route resolves access through `assertCharacterAccess` (`lib/auth/access.ts`) — the single chokepoint (403 non-owner / 404 missing; the `level: "view" | "edit"` param is the reserved sharing seam). Campaign mirrors: `assertCampaignMembership` / `assertCampaignOwner`.

## Cross-cutting data patterns

### Catalog + per-character row

Three distinct approaches, all in play — pick deliberately:

- **Selection tables** (race/class/background/subclass): nullable FK to the catalog **and** an own `name` snapshot. The snapshot is the source of truth for **display** (homebrew/renames); the FK is provenance. Subclass is the exception for **mechanics identity**: the catalog row also carries a stable `slug` (#1277), and a character's mechanics resolve through `resolveSubclassSlug` (FK preferred, exact name as fallback) — never a substring of the display name, which is how a 2014 "Way of Shadow" monk once inherited 2024 "Warrior of Shadow" mechanics (#1339).
- **Full snapshots** (inventory items, learned spells): at acquire/learn time all catalog fields are copied into the per-character row. After that the catalog is ignored — the snapshot is self-contained and freely editable ("Club" → "Club +1"). No merge-with-catalog logic anywhere.
- **FK-keyed live reference** (subclass-granted spells): the *mapping* is seeded rows referencing the catalog by FK; content is resolved live at serialize time, never snapshotted. Reach for this when per-character state is "which catalog rows apply" rather than "an owned, editable copy" — it stays in sync automatically and adding content is seed rows, not code. Trade-off: no per-character drift, a live join on read. This is the substrate for data-authored/homebrew content.

Item mechanics live in category detail tables (`Item*Detail` + their `Inventory*Detail` / `CampaignItem*Detail` snapshot mirrors). Dice fields are always decomposed (`...DiceCount`/`...DiceFaces`/`...Modifier`) to match `RollSpec` — never `"1d6"` strings.

### Derive, don't persist

`serializeCharacter` (`lib/character/character-serialize.ts`) is the full read model: level/proficiency from XP, spell slots/DC, AC (+ ordered `armorClassBreakdown` — the frontend renders the labels verbatim and never does AC math; new bonus parts are appended, never prepended), speed, attacks per action, resources, granted spells, roll modifiers. Every mutation router re-fetches with `characterInclude` and returns `serializeCharacter(updated)`. See the CLAUDE.md non-negotiable and `docs/leveling.md` for the clamp/reconcile pattern.

### Rules edition

`Character.rulesEdition` is authoritative for a sheet; `Campaign.rulesEdition` is only the default a new character is created with (a character may link to several campaigns, and a solo session #1080 has none). It is **write-once** — set by the create transaction, excluded from `PATCH /characters/:id` and from every transaction op — so no reconciler ever has to handle an edition change (#1281, 2026-07-25).

Rules code obtains it exactly one way: `editionOf` (`lib/rules/edition.ts`). The parameter is required, so a `select` that omits `rulesEdition` is a compile error rather than a silent 2024 default. A rule that varies by edition takes `edition` as its last parameter and stays one function per rule; a rule that is edition-invariant — the majority (XP/PB, every spell-slot table, death saves, ASI levels, multiclass prerequisites, Unarmored Defense) — takes no `edition`. `subclassGateLevel` is the pattern-setter, and shows the required discipline: its reconcile-on-write (`reconcileSubclass`), clamp-on-read (`buildClassesView`), write-side-validation (`applySetSubclass`, post-creation subclass set), level-up-plan resolution (`subclassLevelFor`), creation-time validation (`resolveSubclass`/`resolveSubclassName`), and feature/pool derivation (`isSubclassActive`, #1291) callers all resolve through it, so none of the six can disagree (#1308, #1291).

### JSON columns on Character

`hitPoints`, `hitDice`, `abilityScores`, `skills`, `toolProficiencies`, `currency`, `spellcasting?`, `resources?`, `conditions?`, `activeEffects?`. They hold **mutable state only** — all totals/caps are derived at read time and clamped-on-read. `currency` is the only JSON column still patchable via `PATCH /characters/:id`; every other one mutates exclusively through its domain's transactions endpoint. Journal is a separate `JournalEntry` table, not a JSON column.

### Unified audit log

`CharacterEvent` + `CharacterEventField`:

- Single-table inheritance via `category` + `type` discriminators; the full sets live in `lib/activity/events.ts` (`EventCategory`/`EventType`) — that file is authoritative.
- `before`/`after` JSON snapshots drive undo; the free-form `data` JSON carries op-specific extras the revert handler reads (e.g. a self-contained `data.deletedItem` so a deleted row can be rebuilt). `data` lives outside `before`/`after` so it's never diffed.
- Append-only: events are flagged `reverted:true`, never deleted; a `revert` meta-event is appended on undo.
- All ops in one request share a `randomUUID()` `batchId`. `logEvent(tx, params)` writes event + field diffs inside the caller's transaction.
- Undo is LIFO-only (`revertBatch` in `lib/activity/activity.ts`; 409 if not the most-recent non-reverted batch). The LIFO guard skips events from ended sessions (frozen history) and the whole `roll` category (roll events are non-undoable log entries).
- Session tagging: `getActiveSessionId(characterId)` is called at the top of every `apply*Operations()`; events fired during an active campaign session carry its `sessionId`, else `null`.

### Intent-bearing transaction pattern

Every mutable domain follows the same shape:

1. **Zod discriminated union** per op type.
2. **`apply*Operations(characterId, ops)`** in `lib/` — one `prisma.$transaction`, ops applied in order, `logEvent` per meaningful op with the shared `batchId`. Most domains delegate the shared preamble (batchId + active-session lookup + transaction + per-op re-read) to `runCharacterTransaction` (`lib/character/character-transaction.ts`).
3. **Route** — the uniform scaffold (assert `edit` → parse → apply → domain-error → 400 → re-fetch → serialize) is owned by `runTransaction`, exposed either as one router-owned endpoint via `makeTransactionsEndpoint` (`lib/http/transactions-endpoint.ts`) or, for class/subclass abilities, via the single `POST /characters/:id/abilities/:abilityKey/transactions` endpoint dispatching on `ABILITY_REGISTRY` (#1275). Non-uniform endpoints (e.g. `/hp`) keep hand-written handlers.

`lib/inventory/inventory.ts` is the reference implementation for the lib layer. Do not add new mutable domains via `PATCH /characters/:id`. The campaign-side counterpart is DM award/revoke (`lib/campaign/campaign-item-award.ts`), which writes undoable events on the **target** character.

The level-up ceremony endpoint (`/level-up/transactions`) is the **composition variant**: it validates a structured submission against `buildLevelUpPlan`, then drives ONE `runCharacterTransaction` whose applyOp dispatches to the per-domain `*InTx` seams (`applyLevelUpHpInTx`, `applyAdvancementOpInTx`, `setSubclassInTx`, `applyResourceOpInTx`, `applySpellcastingOpInTx`) — never the outer `apply*Operations` wrappers, which each mint their own transaction + `batchId`. The shared `batchId` is what makes the whole ceremony one atomic unit and one `revertBatch` undo.

### Cross-tier shared types

Wire types shared by both tiers (backend transaction-op inputs the frontend must construct, and the shapes the serializers return) are declared **once** in the `@character-sheet/shared-types` workspace (`packages/shared-types/`) and never hand-mirrored. Consume via `import type` only — nothing reaches either runtime bundle, and tsc catches the drift a mirror used to hide (#820). Add a family as one file under `src/`, re-export it from `index.ts`, then re-export the names each tier uses from that tier's existing public module (backend `lib/…`, frontend `types/character/*.ts`) so downstream imports never change. Put only the *consumed* names in those per-tier re-export blocks — a name that was previously used inside its declaring module becomes a dead export the moment it is only forwarded, and the zero-dead-export gate is repo-wide.

Two rules the package can't enforce for you:

- **A runtime value that used to define its type is now a separate declaration.** Where an `as const` tuple fed both a zod schema and `type X = (typeof TUPLE)[number]`, the tuple stays backend-side and the union moves — so add a `expectTypeOf<(typeof TUPLE)[number]>().toEqualTypeOf<X>()` latch, or the schema and the wire type will drift silently. Same for any Prisma enum a shared type spells out as a literal union (the package has no Prisma dependency).
- **Not every look-alike pair is one type.** If a serializer remaps fields on the way out, the internal and wire shapes are genuinely different types that a token-based clone detector cannot tell apart — leave the internal one private.

`@character-sheet/contracts` (`packages/contracts/`, #1370, epic #1369) is `shared-types`' sibling for the one case that package can't cover: a route's zod **validator**, not just its type. It builds to `dist/` and the backend value-imports the schema (it calls `.parse()`); the frontend still only ever `import type`s the schema's `z.infer`, so zod itself never reaches the client bundle. Pick shared-types for a pure wire type; pick contracts when the frontend needs the type a backend route actually validates against.

## Docker Compose

Four services: `db` (Postgres 17, 5432), `pgadmin` (5050, behind the `tools` profile), `backend` (Express, 4000), `frontend` (Vite, 5173). Backend/frontend build from the repo-root context (npm workspaces must link `packages/*`) with the whole repo bind-mounted for hot reload and per-service named volumes shadowing both the hoisted root `node_modules` and the workspace-local one. Prisma client generates into `src/generated/prisma` (gitignored) — run `npx prisma generate` after a fresh clone or schema change.
