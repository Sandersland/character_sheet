# Architecture

Read this when you need the cross-cutting data patterns (catalog+snapshot, JSON columns, audit log, transaction pattern) or the auth/ownership model. For inventories of what exists, read the code — it is the source of truth:

- **Routers:** `backend/src/app.ts` mounts. Catalog/plain-REST routers mount at `/api`; character-scoped mutation routers mount on their owned sub-path under `/api/characters/:id` via `Router({ mergeParams: true })`.
- **Domain logic:** `ls backend/src/lib/` — domain folders (`auth`, `activity`, `srd`, `classes`, `leveling`, `spellcasting`, `combat`, `inventory`, `character`, `session`, `campaign`, `core`, `http`).
- **Frontend routes:** `frontend/src/App.tsx`.
- **Schema:** `backend/prisma/schema.prisma` — model comments carry the per-model reasoning.

## Request pipeline & auth

`app.ts` mounts, in order: security headers → CORS → JSON body → logger → rate limiters → `healthRouter` → `authRouter` → **`requireAuth`** → every other router → optional SPA static → JSON 404 → terminal error handler. The public allowlist is exactly `/health` + `/api/auth/*`; everything else 401s without a session (including unknown `/api/*` paths, so existence isn't leaked).

Identity model: `User` (identity, no tokens) / `AuthAccount` (one row per linked sign-in method — tokens live here, never on `User`) / `AuthSession` (server-side session whose `id` **is** the opaque cookie token). All three cascade-delete with their `User`. Adding an OAuth provider = one `lib/auth/oauth/providers/<name>.ts` + a manifest entry + env vars; adding a non-OAuth method = a new `lib/auth/<method>/` sibling reusing session + cookies.

Ownership: `Character.ownerId` is a required FK. Every character-scoped route resolves access through `assertCharacterAccess` (`lib/auth/access.ts`) — the single chokepoint (403 non-owner / 404 missing; the `level: "view" | "edit"` param is the reserved sharing seam). Campaign mirrors: `assertCampaignMembership` / `assertCampaignOwner`.

## Cross-cutting data patterns

### Catalog + per-character row

Three distinct approaches, all in play — pick deliberately:

- **Selection tables** (race/class/background): nullable FK to the catalog **and** an own `name` snapshot. The snapshot is the source of truth (homebrew/renames); the FK is provenance.
- **Full snapshots** (inventory items, learned spells): at acquire/learn time all catalog fields are copied into the per-character row. After that the catalog is ignored — the snapshot is self-contained and freely editable ("Club" → "Club +1"). No merge-with-catalog logic anywhere.
- **FK-keyed live reference** (subclass-granted spells): the *mapping* is seeded rows referencing the catalog by FK; content is resolved live at serialize time, never snapshotted. Reach for this when per-character state is "which catalog rows apply" rather than "an owned, editable copy" — it stays in sync automatically and adding content is seed rows, not code. Trade-off: no per-character drift, a live join on read. This is the substrate for data-authored/homebrew content.

Item mechanics live in category detail tables (`Item*Detail` + their `Inventory*Detail` / `CampaignItem*Detail` snapshot mirrors). Dice fields are always decomposed (`...DiceCount`/`...DiceFaces`/`...Modifier`) to match `RollSpec` — never `"1d6"` strings.

### Derive, don't persist

`serializeCharacter` (`lib/character/character-serialize.ts`) is the full read model: level/proficiency from XP, spell slots/DC, AC (+ ordered `armorClassBreakdown` — the frontend renders the labels verbatim and never does AC math; new bonus parts are appended, never prepended), speed, attacks per action, resources, granted spells, roll modifiers. Every mutation router re-fetches with `characterInclude` and returns `serializeCharacter(updated)`. See the CLAUDE.md non-negotiable and `docs/leveling.md` for the clamp/reconcile pattern.

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
3. **Route** — the uniform scaffold (assert `edit` → parse → apply → domain-error → 400 → re-fetch → serialize) is owned by `makeTransactionsEndpoint` (`lib/http/transactions-endpoint.ts`). Non-uniform endpoints (e.g. `/hp`) keep hand-written handlers.

`lib/inventory/inventory.ts` is the reference implementation for the lib layer. Do not add new mutable domains via `PATCH /characters/:id`. The campaign-side counterpart is DM award/revoke (`lib/campaign/campaign-item-award.ts`), which writes undoable events on the **target** character.

The level-up ceremony endpoint (`/level-up/transactions`) is the **composition variant**: it validates a structured submission against `buildLevelUpPlan`, then drives ONE `runCharacterTransaction` whose applyOp dispatches to the per-domain `*InTx` seams (`applyLevelUpHpInTx`, `applyAdvancementOpInTx`, `setSubclassInTx`, `setFightingStyleInTx`, `applyResourceOpInTx`, `applySpellcastingOpInTx`) — never the outer `apply*Operations` wrappers, which each mint their own transaction + `batchId`. The shared `batchId` is what makes the whole ceremony one atomic unit and one `revertBatch` undo.

### Cross-tier shared types

Wire types shared by both tiers (backend transaction-op inputs the frontend must construct) have a single source of truth in the `@character-sheet/shared-types` workspace (`packages/shared-types/`), consumed via `import type` only — so nothing reaches either runtime bundle and tsc catches drift that hand-mirrors used to hide (#820). Each tier re-exports the names it uses from its existing public module (backend `lib/spellcasting/spellcasting.ts`, frontend `types/character/spells.ts`) so downstream imports are unchanged. Add a mirror family as one file under `src/`, export only names consumed by name (union-only members stay module-private for the zero-dead-export gate), and re-export per tier. The spellcasting-op family is the migrated pattern-setter; remaining families (`#820`) still hand-mirror until moved.

## Docker Compose

Four services: `db` (Postgres 17, 5432), `pgadmin` (5050, behind the `tools` profile), `backend` (Express, 4000), `frontend` (Vite, 5173). Backend/frontend build from the repo-root context (npm workspaces must link `packages/*`) with the whole repo bind-mounted for hot reload and per-service named volumes shadowing both the hoisted root `node_modules` and the workspace-local one. Prisma client generates into `src/generated/prisma` (gitignored) — run `npx prisma generate` after a fresh clone or schema change.
