# Class Features: the `ClassFeature` row model

Read this when adding or changing class/subclass content, or touching any of `ClassFeature`'s tier-shaped Json columns (`backend/prisma/schema.prisma`). Column-level shapes, citations, and each column's own tie-break rule live in the schema comments there — this doc covers only what reading one column comment can't tell you: how the tie-break rules compare across columns, how a row becomes gameplay, and how to add a row safely.

## Tier columns: three tie-break rules, not one

`ClassFeature` has seven tier-shaped Json columns, plus an eighth, `effectBuffs`, whose `modifier` field is itself tier-shaped. Each column's own rule is documented on the column in `backend/prisma/schema.prisma` (`resourceOnInitiative`'s comment already states the cross-column comparison directly) — this doc doesn't repeat that table. The rule to keep in your head: a new tier column defaults to ascending-by-`minLevel`-last-wins (the `tierAt` rule — six of the eight columns, including `effectBuffs.modifier` via `evaluateBuffModifier`) unless it has a real reason not to, as `resourceDetailTiers` (needs independent per-label sequencing) and `resourceOnInitiative`/each `effectBuffs` entry's own `minLevel` (regen sources and buffs both need earlier grants to keep applying, not get superseded) did.

The gotcha worth knowing before you hit it: below a resource's first `resourceTotals` tier, `poolFromRow` returns `null` and the pool doesn't exist yet; below an `effectBuffs` entry's first `modifier` tier, `evaluateBuffModifier` returns `0` and the buff exists but does nothing. Same underlying rule, opposite failure mode — gate the buff's own `minLevel` if a 0 modifier below some level isn't what you want.

## Block structure: one row, up to ten interpreted blocks

A `ClassFeature` row is not one thing — it's an identity (name/level/description/edition) plus up to ten independent optional blocks, each read by its own function. A row can populate any subset. Each block's columns, citations, and reader function are documented on the column itself in `backend/prisma/schema.prisma` (the `ClassFeature` model's own block comments) — this doc covers only the cross-cutting behavior no single column comment can state:

- A **Choice** block whose count can shrink on level-down also needs `docs/leveling.md`'s reconciliation recipe — that doc owns the choice-column reconciler pattern, not this one.
- An **Activation** block's `resolverKind: "toggle"` forks into `toggleActionsFromRow`, which synthesizes an activate/end action PAIR from one row via `endActionKey`, and routes the row's Buff/Immunity blocks through the activate side (`applyToggleRowActionInTx`).

## The one permanent TS holdout

`summonBondedWeapon` (Fighter/Eldritch Knight, 2014-only) is the one row that stays TS forever, in `DERIVED_ACTIONS` (`backend/src/lib/classes/actions.ts`): its `enabled` gate reads a live count of `weaponBonded` inventory rows, and no `ClassFeature` column expresses a live-inventory gate. This is machine-enforced, not just convention: `scripts/check-class-ts-migration.sh` ratchets `DERIVED_ACTIONS_MAX=1` and fails CI if a second entry ever lands — the ratchet only ever moves down.

## Adding new class/subclass content

1. Add the row to the class's seed file, `backend/prisma/seed/<class>-features.ts` (merged into `CLASS_FEATURES` in `class-features.ts`). Populate only the blocks the feature needs.
2. `classFeatureSeedSchema`, exercised via `assertSeedContentValid` (`backend/prisma/seed/__tests__/validate.test.ts`), structurally validates the row and — over the whole `CLASS_FEATURES` array — rejects a duplicate pool/choice declaration (`assertNoDuplicatePoolDeclaringRows`/`assertNoDuplicateChoiceDeclaringRows`) and a `choiceKey` that isn't properly subclass-scoped (`choiceRowIsSubclassScoped`).
3. Two CI gates fire mechanically on the seed file whether or not you write a test: `check-seed-data-modules.sh` rejects any `prisma.`/`upsert(`/`await` token there (that logic belongs in `seed-class-features.ts`, never the data file); `check-class-ts-migration.sh` is the holdout ratchet above.
4. If the row is meant to be player-activatable (`activationCost` + `resourceKey` set), know what's NOT covered: `action-effect-parity.test.ts` only proves the key is reachable from some row — a new key that collides with an existing `ACTION_EFFECT_FN` entry passes it silently, since `ACTION_EFFECT_FN` is checked first and would shadow the row's own level/edition gate and activation requirements. The only guard is `ROW_ONLY_ACTION_KEYS`, a hand-maintained list in `backend/src/lib/classes/__tests__/actions.test.ts` — add your key there if it must never be dual-homed; nothing catches the omission automatically.
5. Extend the relevant existing suite (`backend/src/lib/classes/__tests__/` for behavior, `backend/prisma/seed/__tests__/seed-data.test.ts` for granted-spell referential integrity and catalog business-key uniqueness) rather than inventorying what's there — every shipped class/subclass is already covered by one or both.
