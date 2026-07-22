# Leveling: XP, Level-Up/Down, and Level-Gated State

Read this when touching XP or level-up/level-down, or adding any feature whose availability or count depends on character level (subclass, maneuvers known, feats/ASIs, choose-N picks).

## XP → level is derived, never persisted

`experiencePoints` is the only stored authority. `levelForExperience` / `proficiencyBonusForLevel` / `experienceProgress` (`lib/leveling/experience.ts`, pure) are spread onto the wire shape by `serializeCharacter`. Never re-add these as columns.

**Level-up (HP gain) is a separate explicit action:** XP can outrun applied levels. `hitDice.total` counts applied HP level-ups (mirrored by `classEntries[0].level`); `pendingLevelUps = derivedLevel − hitDice.total` is derived and drives the Level-up UI. The action is a `levelUp` op on `POST /characters/:id/hp`.

**Level-up plan:** `buildLevelUpPlan(character, targetClassEntry)` (`lib/leveling/level-up-plan.ts`) returns the ordered choice-steps one level grants. It never re-encodes thresholds — each step is derived from an existing rule function, usually by diffing level N vs N−1 (the prepared-spell swap offer is the exception: emitted every level for onLevelUp-cadence casters via `swapCadenceFor`, so `newSpells` can carry `count: 0` with `meta.canSwap`). When a `subclass` step is emitted and the target subclass is still null, subclass-derived steps are absent; the ceremony re-invokes the planner with the chosen subclass. The plan is served to the frontend by `GET /characters/:id/level-up/plan`.

**Level-down auto-reverses:** when XP drops the derived level below `hitDice.total`, `applyExperienceOperations` calls `revertLevelUps` in the same transaction (recovers per-level HP gains from `levelUp` events, decrements `hitDice.total`, repairs the class entry level), then runs reconciliation.

## Level-gated reconciliation — the pattern

Level-gated state is persisted state whose legal maximum is determined by level. Two complementary layers, both required — and both must compute the legal limit via one shared rule function (`lib/srd/` / `lib/leveling/` / `lib/classes/class-features.ts`), never two inline copies of the rule:

**Layer 1 — reconcile-on-write** (destructive, audited, undoable): `reconcileLevelGatedState(ctx)` runs the `LEVEL_GATED_RECONCILERS` array (`lib/leveling/level-reconciliation.ts`) inside the XP transaction after every XP op. That array is authoritative for what's registered; **order matters** — later reconcilers observe earlier ones' writes (e.g. maneuvers must see the already-cleared subclass so the derived cap goes to 0). Reconciliation events ride the same `batchId` as the XP event and reuse existing undo branches (`class` restores from `before`; `resources` restores the full `before.resources` snapshot).

**Layer 2 — clamp-on-read** (non-destructive, defense-in-depth): `serializeCharacter` caps displayed values to the derived limit (`slice(0, choiceCount)` / `Math.min(total, used)`), so a character already in an invalid state renders correctly before their next XP op.

### Generic subclass "choose N" — data, not code

A feature that is just "choose N options from a catalog" with no extra mechanics is declared as **data** — no new reconciler, state key, or clamp:

- Declare `choices: [{ key, label, catalogSource, count: (level) => n }]` on the subclass in `lib/classes/<class>.ts`.
- Options are seeded `GrantedAbility` rows keyed by `source = catalogSource` (`prisma/seed/subclass-choices.ts`); `GET /api/subclass-choices/:source` lists them.
- Selections persist in the generic `resources.choicesKnown[key]` map, mutated via the existing resources endpoint (`learn`/`forgetSubclassChoice`).
- `reconcileSubclassChoices` and one read-clamp loop cover every such choice generically.

Hand-rolled reconcilers remain only for features with extra mechanics (maneuvers/tool profs — save DCs, cast/swap ops, validation).

### Choice-less grants are pure-derived

A level-gated grant with zero player choice (e.g. Warrior of Shadow's Minor Illusion at L3) is a pure function of `(subclass, level)` — derived at serialize time (`deriveGrantedSpells`) and **never persisted**. `reconcileGrantedSpells` is only a guard against leaked persisted grants, not the primary enforcement.

## Checklist: adding a new level-gated feature

1. **Rules data** → the appropriate `lib/srd/` file (or `lib/classes/<class>.ts`). Never inline in a route or duplicate on the frontend.
2. **Reconciler** → for a "known" list capped by a choice count, write a thin `reconcileKnownList(ctx, config)` config; otherwise a hand-written `Reconciler` (one indexed re-read → derive cap → early-return if within → trim → `logEvent` with a category that has an existing undo branch). Register it in `LEVEL_GATED_RECONCILERS` in dependency order.
3. **Clamp-on-read** in `serializeCharacter`, analogous to the existing `slice`/`Math.min` clamps.
4. **New `EventType`** (if needed): add to the `CharacterEventType` Prisma enum + the `EventType` union in `lib/activity/events.ts`; `prisma migrate dev` **and** `prisma generate` (both required).
5. **Undo branch** (only if you introduced a new event category): add it to the revert handler in `lib/activity/activity.ts`. Reconcilers writing into `Character.resources` get undo for free via the `resources` branch.
6. **Tests** — mirror the maneuver block in `routes/__tests__/experience.test.ts`: partial trim (oldest kept), full clear, event emitted, undo restores, and read-clamp serves the capped count without an XP op.
