# Leveling: XP, Level-Up, Level-Down, and Level-Gated State

Read this when you are:
- touching XP or the level-up/level-down flow
- adding any feature whose **availability or count depends on character level** (subclass, maneuvers known, tool proficiencies, fighting style, feats, Ability Score Improvements)
- trying to understand why `level` is not a column

---

## XP → level is derived, never persisted

`experiencePoints` is the only stored authority for a character's level. `level` and `proficiencyBonus` are **never columns** — they are computed at read time:

```
backend/src/lib/leveling/experience.ts
  levelForExperience(xp)         → number 1–20 (pure, no DB)
  proficiencyBonusForLevel(lvl)  → number
  experienceProgress(xp)         → { level, proficiencyBonus, currentLevelThreshold,
                                      nextLevelThreshold, xpToNextLevel }
```

`serializeCharacter` (`backend/src/lib/character-serialize.ts`) calls `experienceProgress(row.experiencePoints)` and spreads the result onto the wire shape. These values must never be added back as columns — add or modify the curve in `experience.ts` and every read automatically reflects it.

---

## Level-up (HP gain) is a separate, explicit action

XP going up does **not** automatically raise HP. A character can have XP at level 7 while only having applied HP for 5 levels. The fields that track this are:

| Field | What it represents |
|---|---|
| `experiencePoints` | XP-derived level authority |
| `hitDice.total` | How many HP level-ups have actually been applied |
| `classEntries[0].level` | Mirrors `hitDice.total` (repaired by `revertLevelUps`) |

`pendingLevelUps = derivedLevel − hitDice.total` is computed in `serializeCharacter` and drives the "Level up" button in the UI. The level-up action hits `POST /characters/:id/hp` with a `levelUp` op.

---

## Level-down auto-reverses HP and dice

When a new XP value drops the derived level below `hitDice.total`, `applyExperienceOperations` calls `revertLevelUps` inside the same transaction:

```
backend/src/lib/leveling/experience-ops.ts
  revertLevelUps(tx, characterId, currentHdTotal, targetLevel, batchId)
```

It reads the most recent `levelUp` CharacterEvents newest-first to recover exact per-level HP gains (fixed-average fallback for levels without an event record), subtracts them from `hitPoints.max` / `hitPoints.current`, decrements `hitDice.total`, and repairs `classEntries[0].level` to match. Emits one `hitPoints/levelDown` event carrying `data.primaryEntryId` so the undo handler can restore the class-entry level.

---

## Level-gated reconciliation — the pattern

Level-gated state is **persisted state whose legal maximum is determined by the character's level**. Examples (each has a registered reconciler): subclass choice (locked until `class.subclassLevel`), maneuvers known, tool proficiencies, fighting style, and Ability Score Improvements / feats (granted at fixed class levels, handled by `reconcileAdvancements`).

When level drops, this state must be reconciled. The system uses two complementary layers.

### Layer 1 — Reconcile-on-write (destructive, audited, undoable)

Runs inside the XP transaction immediately after `revertLevelUps`. The entry point is:

```
backend/src/lib/leveling/level-reconciliation.ts
  reconcileLevelGatedState(ctx: ReconcileContext)
```

`ReconcileContext` carries `{ tx, characterId, newDerivedLevel, batchId }`. Internally it runs the `LEVEL_GATED_RECONCILERS` array **in order**:

| Reconciler | What it does |
|---|---|
| `reconcileClassEntryLevels` | Runs **first**. Trims multiclass `CharacterClassEntry` levels (and removes entries that fall to level 0, highest `position` first) so the summed class levels never exceed `newDerivedLevel`. Snapshots the pre-reconcile entries so undo can restore/recreate them; emits `class/classLevelsReconciled`. No-op for single-class characters. |
| `reconcileSubclass` | Per-entry (#125): clears `subclassId`/`subclass` on **any** `CharacterClassEntry` whose effective level is below that class's `subclassLevel`. Effective level is the XP-derived total for a single-class character (the per-class column is self-healed lazily by the HP level-up) and the per-class `entry.level` for a multiclass character. Emits one `class/subclassRemoved` per cleared entry. Mirrored by a clamp-on-read in `serializeCharacter`'s `classes` block. |
| `reconcileGrantedSpells` | Runs **after `reconcileSubclass`** (so it sees the already-cleared subclass); defense-in-depth for **derived** subclass-granted spells (e.g. a Way of Shadow monk's Minor Illusion at L3). These are pure-derived at read time and **never persisted** in the happy path, so this only fires if a `source:"subclass"` entry ever leaks into the stored `spellcasting.spells[]`. It re-derives valid grants across **every** class entry (symmetric with `collectGrantedSpells`) and strips any leaked grant no longer valid at the new level; if the stripped grant was the concentrated spell, `concentratingOn` is nulled too (Shadow Arts / still-kept spells untouched). Reuses the `spellcasting`-category undo branch (restores `before.spellcasting`) — no new EventType. Early-returns when no `source:"subclass"` entry is present (the normal case). |
| `reconcileManeuvers` | Runs after `reconcileSubclass` so it sees a cleared subclass. Calls `deriveResources(...)` for the new level; `allowed = maneuverChoiceCount ?? 0`. Trims `maneuversKnown` to the first `allowed` entries (oldest kept, LIFO). Emits `resources/maneuversReconciled`. |
| `reconcileDisciplines` | Way of the Four Elements. Runs after `reconcileSubclass`; `allowed = disciplineChoiceCount ?? 0` (1/2/3/4 at monk levels 3/6/11/17). Trims `disciplinesKnown` to the first `allowed` entries (oldest kept, LIFO). Emits `resources/disciplinesReconciled`. |
| `reconcileToolProficiencies` | Trims `toolProficienciesKnown` when the subclass no longer grants a tool choice (level dropped below 3, or subclass cleared). Also runs after `reconcileSubclass` for the same reason. Creation-fixed tool profs (in `Character.toolProficiencies`) are untouched. Uses a `resources`-category event. |
| `reconcileFightingStyle` | Clears the persisted `fightingStyle` when `fightingStyleChoiceCount` drops to 0 at the new level (e.g. a class change away from Fighter). Uses a `resources`-category event. |
| `reconcileAdvancements` | LIFO-reverses the tail of `advancements[]` (ASIs/feats) whose required level is now above the derived level — subtracting the stored deltas from `abilityScores`/`hitPoints`/`initiativeBonus`. Order-independent (ASI slots are class-level-gated, not subclass-gated), so it runs last. Uses `advancement`-category events. |

Order matters: later reconcilers observe earlier ones' writes (maneuvers and tool profs must see the already-cleared subclass so that `deriveResources` returns `null → allowed = 0` for a full reset).

`reconcileManeuvers`, `reconcileDisciplines`, and `reconcileToolProficiencies` are thin configs over a shared `reconcileKnownList(ctx, config)` helper that owns the fetch → derive → trim → audit flow (see the checklist below for the config fields).

#### Choice-less level-gated grants are pure-derived, not persisted

A level-gated grant with **zero player choice** (e.g. a Way of Shadow monk always gets Minor Illusion at L3) is a pure function of `(subclass, level)`. It is therefore **derived at serialize time** by `deriveGrantedSpells` in `backend/src/lib/granted-spells.ts` and merged into the spellcasting view — it is **never written** into `spellcasting.spells[]`. The op runner injects it transiently so the Cast button resolves its id, then strips it before persisting. This keeps the reconciler/clamp non-negotiable satisfied without reintroducing drift: `reconcileGrantedSpells` is a **guard** against a leaked persisted grant, not the primary enforcement. The derived id scheme `granted:<subclass>:<spell>` is the seam a future side-table would key on if a *stateful* granted spell ever appears. Snapshotting granted content (freezing the SRD text at grant time) is a Phase-D versioning concern introduced uniformly with spells/items — not by persisting grants ad-hoc.

Each reconciler is an async function with the same signature:
```typescript
type Reconciler = (ctx: ReconcileContext) => Promise<void>;
```

It runs unconditionally on every XP op (cheap — one indexed read). This means:
- Characters who gained a subclass via XP alone (never clicked "Level Up") still get reconciled.
- Characters already in an invalid state are self-healed the moment their next XP op runs.

**Undo:** reconciliation events ride the same LIFO `batchId` as the XP event. Because they use standard `category/type` event shapes that already have undo branches in `backend/src/routes/activity.ts`, no new revert code is needed:
- `class` category → restores `subclassId`/`subclass` from `before` via `data.classEntryId`
- `resources` category → restores full `before.resources` JSON (used counts + `maneuversKnown`, `disciplinesKnown`, `toolProficienciesKnown`)

### Layer 2 — Clamp-on-read (non-destructive, defense-in-depth)

`serializeCharacter` caps displayed values to the derived limit so characters already in an invalid state render correctly before their next XP op:

```typescript
// backend/src/routes/characters.ts — inside the `resources` block
maneuversKnown:
  derivedRes.maneuverChoiceCount !== undefined
    ? stored.maneuversKnown.slice(0, derivedRes.maneuverChoiceCount)
    : stored.maneuversKnown,
```

This mirrors the adjacent `Math.min(pool.total, stored.used[pool.key] ?? 0)` clamps for resource pools and `Math.min(total, stored.slotsUsed[…])` for spell slots.

---

## Checklist: adding a new level-gated feature

When you ship a feature whose count or availability depends on level (feats, ASI, Ki points unlocked at a certain level, etc.):

### 1. Rules data → `srd.ts`
Add the level table and derivation function to `backend/src/lib/srd.ts`. Example: a `featsGrantedAt(className, level)` helper returning how many feats the character is allowed. Never inline rules in a route or duplicate them on the frontend (see CLAUDE.md non-negotiables).

### 2. Write a `Reconciler` and register it
In `backend/src/lib/leveling/level-reconciliation.ts`:
- If the feature is a **"known" list in `Character.resources`** capped by a level-derived choice count (like maneuvers/disciplines/tool profs), write it as a thin `reconcileKnownList(ctx, config)` config — the helper owns the fetch → derive → early-return → trim → update → `logEvent` flow. The config supplies: `listKey`, `allowed(derived)` (the choice-count extractor), `eventType`, `summary(removedCount, allowed)`, and `snapshot(state)` (the before/after event payload — called on the live state before and after the trim).
- Otherwise write `async function reconcile<Feature>(ctx: ReconcileContext): Promise<void>` by hand:
  - Re-read only the persisted fields you need (one indexed read).
  - Call the relevant derivation from `srd.ts` to get the new cap.
  - Early-return if current count ≤ cap (no action).
  - Trim/clear excess, `tx.character.update(...)`.
  - `logEvent(tx, { category, type, before, after, data, batchId })` — pick a category that has an existing undo branch in `activity.ts` if possible.
- Add the new reconciler to `LEVEL_GATED_RECONCILERS` in dependency order.

### 3. Clamp-on-read in `serializeCharacter`
In `backend/src/routes/characters.ts`, add a `Math.min`/`slice` clamp in the serialization block for the new field, analogous to `maneuversKnown.slice(0, maneuverChoiceCount)`.

### 4. New `EventType` (if needed)
- Add the value to `CharacterEventType` enum in `backend/prisma/schema.prisma`.
- Add it to the `EventType` union in `backend/src/lib/events.ts`.
- Migrate + regenerate:
  ```bash
  cd backend
  DATABASE_URL=postgresql://character_sheet:character_sheet@localhost:5432/character_sheet \
    npx prisma migrate dev --name add_<name>_event_type
  DATABASE_URL=postgresql://character_sheet:character_sheet@localhost:5432/character_sheet \
    npx prisma generate
  ```
  Both steps are required — the generated client can be stale even after migration.

### 5. Undo branch (if needed)
If you had to introduce a new event category not already handled in `routes/activity.ts`, add a branch to the LIFO revert handler there. Reuse an existing branch where possible — the `resources` category already restores the full `before.resources` JSON, so any reconciler that writes into `Character.resources` gets undo for free.

### 6. Tests
Mirror the maneuver test block in `backend/src/routes/__tests__/experience.test.ts`:
1. Partial trim: level drops to a cap > 0 → excess removed, oldest kept.
2. Full clear: level drops below grant level → all entries removed.
3. Event emitted: `resources/maneuversReconciled` (or your equivalent) appears in the activity log.
4. Undo: reverting the XP-reset batch restores the full before-state.
5. Read-clamp: a character with persisted excess at the wrong level serves the capped count on `GET` without any XP op.
