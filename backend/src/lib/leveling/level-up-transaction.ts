// Composition seam for the unified level-up endpoint (#885): resolves the target
// class entry, validates a structured submission against its derived plan
// (validateLevelUpSubmission), maps the validated steps to tagged domain ops, and
// applies them all under ONE batchId in ONE runCharacterTransaction. No 5e rules
// live here — every rule is delegated to the validator/plan and the *InTx seams.
import type { LevelUpOperation, LevelUpTarget } from "@character-sheet/contracts";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import {
  applyAdvancementOpInTx,
  type AdvancementOperation,
} from "@/lib/leveling/advancement.js";
import {
  setSubclassInTx,
  type SetSubclassOperation,
} from "@/lib/classes/class.js";
import { applyResourceOpInTx, type ResourceOperation } from "@/lib/classes/resources.js";
import { applySpellcastingOpInTx, type LearnSpellOperation, type SpellcastingOperation } from "@/lib/spellcasting/spellcasting.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import { classesOf, rejectCrossEditionSpellForks, SPELL_CLASS_MEMBERSHIP_SELECT } from "@/lib/spellcasting/spell-classes.js";
import { loadSubclassSpellListExpansionIds } from "@/lib/spellcasting/spell-list-expansion.js";
import {
  advancingHitDie,
  applyLevelUpHpInTx,
  normalizeHitDice,
} from "@/lib/combat/hitpoints.js";
import { effectiveMaxHitPointsForRow } from "@/lib/combat/conditions.js";
import {
  validateLevelUpSubmission,
  InvalidLevelUpError,
  type LevelUpSubmission,
} from "./level-up-submission.js";
import type {
  LevelUpPlanCharacter,
  LevelUpStep,
  LevelUpStepKind,
  TargetClassEntry,
} from "./level-up-plan.js";
import { editionOf } from "@/lib/rules/edition.js";
import { crossEditionRejection } from "@/lib/rules/catalog-edition.js";
import { subclassGateLevel } from "./effective-levels.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";
import { FEATURE_ROWS_CLASS_FEATURES, FEATURE_ROWS_SUBCLASS_FEATURES } from "@/lib/classes/feature-rows-select.js";

// A validated step, mapped to the seam that applies it. Each domain re-reads its
// own state via `tx`, so a later op sees the earlier op's write (e.g. the maneuver
// steps see the subclass the earlier `class` op set on the primary entry).
type LevelUpTxOp =
  | { domain: "hp"; op: LevelUpOperation }
  | { domain: "advancement"; op: AdvancementOperation }
  | { domain: "class"; op: SetSubclassOperation }
  | { domain: "resources"; op: ResourceOperation }
  | { domain: "spellcasting"; op: SpellcastingOperation };

// Everything resolveLevelUpContext hands to validation + op-building.
export interface LevelUpContext {
  planCharacter: LevelUpPlanCharacter;
  targetEntry: TargetClassEntry;
  chosenSubclassName: string | null;
  /** Display-only (#1177) — surfaced on the plan route's `target.isPrimary`. */
  targetIsPrimary: boolean;
  // #1546 Part B-i: the not-yet-committed `?subclassId=` pick's own feature
  // rows (null when no subclassId was submitted) — the "picked" half of the
  // persisted/picked pair this context also carries on targetEntry (mirrors
  // persistedGrantSource/pickedGrantSource, level-up.ts's #898 pattern). Fed
  // to resolveLevelUpPlan by every caller of this context (the commit path
  // and the GET /plan route) so the re-plan splice carries the matching rows.
  pickedSubclassFeatureRows: ClassFeatureRow[] | null;
}

const TARGET_ENTRY_SELECT = {
  id: true,
  name: true,
  subclass: true,
  level: true,
  position: true,
  classId: true,
  class: {
    select: {
      // #1380: the advancing class's catalog hit die, the same shape
      // buildHpOpContext selects for the commit path.
      hitDie: true,
      // #1546 Part B-i: the class's OWN feature rows — see
      // FEATURE_ROWS_CLASS_FEATURES for why the filter is load-bearing.
      features: FEATURE_ROWS_CLASS_FEATURES,
      // #1497: effectiveMaxHitPointsForRow's featSlotCap inputs (every class
      // entry, not just the target) — the same two columns buildHpOpContext
      // selects for its own row.classEntries. `subclassLevel` (#1123):
      // draconicResilienceMaxHpTerm's 2014-gate input, same composition.
      extraAsiLevels: true,
      fightingStyleFeatLevel: true,
      subclassLevel: true,
    },
  },
  // #1546 Part B-i: the PERSISTED subclass's own feature rows. Absent
  // (relation null) when no subclass is set yet. `id` (#1631): the catalog
  // Subclass row's own id, so resolveLevelUpContext can load its
  // SubclassSpellListExpansion rows without re-resolving by name.
  // `slug` (#1123): draconicResilienceMaxHpTerm's FK identity input.
  subclassRef: { select: { id: true, slug: true, features: FEATURE_ROWS_SUBCLASS_FEATURES } },
} satisfies Prisma.CharacterClassEntrySelect;

// Fetch the target class's catalog subclassLevel/extraAsiLevels/
// fightingStyleFeatLevel (#1529) in one read, resolving subclassLevel through
// the edition seam (#1308) — that column is 2014-only (subclassGateLevel
// hardcodes 3 under 2024), so subclassStep must never compare against the raw
// column. extraAsiLevels/fightingStyleFeatLevel carry no edition fork
// (CLAUDE.md: ASI levels and the FS grant level agree in both editions) and
// pass through as-is — `[]`/`null` for a homebrew class with no catalog row,
// same fallback advancementSlotsForLevel/fightingStyleFeatSlots apply.
async function targetClassCatalogFor(
  classId: string | null,
  className: string,
  edition: RulesEdition,
): Promise<{ subclassLevel: number; extraAsiLevels: number[]; fightingStyleFeatLevel: number | null }> {
  const select = { subclassLevel: true, extraAsiLevels: true, fightingStyleFeatLevel: true } as const;
  const row = classId
    ? await prisma.characterClass.findUnique({ where: { id: classId }, select })
    : await prisma.characterClass.findFirst({
        where: { name: { equals: className, mode: "insensitive" } },
        select,
      });
  return {
    subclassLevel: subclassGateLevel(row?.subclassLevel, edition),
    extraAsiLevels: row?.extraAsiLevels ?? [],
    fightingStyleFeatLevel: row?.fightingStyleFeatLevel ?? null,
  };
}

type TargetEntryRow = Prisma.CharacterClassEntryGetPayload<{ select: typeof TARGET_ENTRY_SELECT }>;

// Every field the rest of resolveLevelUpContext needs about the advancing
// class entry, for EITHER target.kind. Split out of resolveLevelUpContext
// (#1546 Part B-i added the classFeatureRows/subclassFeatureRows pair to
// both branches, which is what pushed the caller over the cognitive-
// complexity gate) so the existing/new branch stays a single-purpose helper
// instead of inflating the caller's own branch count.
interface ResolvedTargetEntry {
  targetClassName: string;
  persistedSubclass: string | null;
  // #1631: the PERSISTED subclass's own catalog id (subclassRef.id) — null
  // when no subclass is chosen yet. Distinct from persistedSubclass (a name)
  // because loadSubclassSpellListExpansionIds keys on id, mirroring
  // resolvePickedSubclass's own subclassId param for the not-yet-committed pick.
  persistedSubclassId: string | null;
  newLevel: number;
  classId: string | null;
  targetIsPrimary: boolean;
  // The advancing class's own catalog die; null falls back to hitDice.die at the call site.
  catalogHitDie: string | null;
  // #1546 Part B-i: the PERSISTED half of the featureRows carrier — the
  // class's own rows always resolve (every class has a catalog row or the
  // relation is simply empty); subclassFeatureRows is empty for a brand new
  // entry (target.kind === "new" never has a persisted subclass) or an
  // existing entry with no subclass chosen yet. Cast mirrors featureRowsOf's
  // own (feature-rows-select.ts) — Prisma types resourceTotals/
  // resourceDieTiers/derivedStatTiers as opaque Prisma.JsonValue.
  classFeatureRows: ClassFeatureRow[];
  subclassFeatureRows: ClassFeatureRow[];
}

// #1631: split out of resolveExistingTargetEntry purely to keep that
// function's own cyclomatic count from crossing the CI health gate (mirrors
// this file's own targetClassCatalogFor/resolveTargetEntry split reasoning).
function persistedSubclassIdOf(entry: TargetEntryRow): string | null {
  return entry.subclassRef?.id ?? null;
}

function resolveExistingTargetEntry(
  target: Extract<LevelUpTarget, { kind: "existing" }>,
  classEntries: TargetEntryRow[],
  isMulticlass: boolean,
  hitDiceTotal: number,
): ResolvedTargetEntry {
  const entry = classEntries.find((e) => e.id === target.classEntryId);
  if (!entry) throw new InvalidLevelUpError(`Class entry not found: ${target.classEntryId}`);
  return {
    targetClassName: entry.name,
    persistedSubclass: entry.subclass,
    persistedSubclassId: persistedSubclassIdOf(entry),
    newLevel: isMulticlass ? entry.level + 1 : hitDiceTotal + 1,
    classId: entry.classId,
    targetIsPrimary: entry.position === 0,
    catalogHitDie: entry.class?.hitDie ?? null,
    classFeatureRows: (entry.class?.features ?? []) as unknown as ClassFeatureRow[],
    subclassFeatureRows: (entry.subclassRef?.features ?? []) as unknown as ClassFeatureRow[],
  };
}

async function resolveNewTargetEntry(target: Extract<LevelUpTarget, { kind: "new" }>): Promise<ResolvedTargetEntry> {
  const catalog = await prisma.characterClass.findUnique({
    where: { id: target.classId },
    select: { name: true, hitDie: true, features: FEATURE_ROWS_CLASS_FEATURES },
  });
  if (!catalog) throw new InvalidLevelUpError(`Class not found: ${target.classId}`);
  return {
    targetClassName: catalog.name,
    persistedSubclass: null,
    persistedSubclassId: null, // a brand new entry has no persisted subclass
    newLevel: 1,
    classId: target.classId,
    targetIsPrimary: false, // a new multiclass entry is never the primary
    catalogHitDie: catalog.hitDie,
    classFeatureRows: catalog.features as unknown as ClassFeatureRow[],
    subclassFeatureRows: [], // a brand new entry has no persisted subclass
  };
}

// Split into one function per target.kind (resolveExistingTargetEntry/
// resolveNewTargetEntry above) so this dispatcher stays trivial — each
// branch's own guard-throw and #1546 Part B-i's featureRows pair no longer
// inflate ONE function's complexity.
function resolveTargetEntry(
  target: LevelUpTarget,
  classEntries: TargetEntryRow[],
  isMulticlass: boolean,
  hitDiceTotal: number,
): Promise<ResolvedTargetEntry> {
  return target.kind === "existing"
    ? Promise.resolve(resolveExistingTargetEntry(target, classEntries, isMulticlass, hitDiceTotal))
    : resolveNewTargetEntry(target);
}

// Resolves the not-yet-committed `?subclassId=` pick into its name + own
// feature rows — the "picked" half of the featureRows carrier pair (#1546
// Part B-i), split out for the same reason as resolveTargetEntry above.
async function resolvePickedSubclass(
  subclassId: string | undefined,
  edition: RulesEdition,
): Promise<{ chosenSubclassName: string | null; pickedSubclassFeatureRows: ClassFeatureRow[] | null }> {
  if (!subclassId) return { chosenSubclassName: null, pickedSubclassFeatureRows: null };
  // Cross-edition before membership: a wrong-edition row is "not in this
  // character's catalog at all" (#1414), the ordering applySetSubclass also
  // carries. Reuses the `edition` const bound at the call site — never
  // resolve edition twice for one resolution. Membership stays one copy of
  // the rule (applySetSubclass re-validates it in-tx); here we only resolve
  // id → name. `features` (#1546 Part B-i): this pick's own rows, so a
  // re-plan (the subclass hasn't been committed to the character yet) still
  // resolves its subclass-derived choices — one line added to an existing
  // lookup, no new query.
  const sub = await prisma.subclass.findUnique({
    where: { id: subclassId },
    select: { name: true, edition: true, features: FEATURE_ROWS_SUBCLASS_FEATURES },
  });
  if (!sub) throw new InvalidLevelUpError(`Subclass not found: ${subclassId}`);
  const mismatch = crossEditionRejection(sub, `Subclass "${sub.name}"`, edition);
  if (mismatch) throw new InvalidLevelUpError(mismatch);
  return { chosenSubclassName: sub.name, pickedSubclassFeatureRows: sub.features as unknown as ClassFeatureRow[] };
}

// #1631: the EFFECTIVE subclass id this level-up's newSpells step should
// widen against — the not-yet-committed `?subclassId=` pick when this same
// level-up sets a new subclass (a level-1 2014 Warlock choosing its patron),
// else the persisted one (an already-Fiend warlock leveling further). Mirrors
// resolveLevelUpPlan's own persisted/picked precedence (level-up-submission.ts).
function effectiveSubclassId(subclassId: string | undefined, persistedSubclassId: string | null): string | null {
  return subclassId ?? persistedSubclassId;
}

// Reads the character + resolves a level-up target into the validator inputs
// (shared by applyLevelUpTransaction and the GET plan route, #886). The
// per-entry `level` column can lag hitDice.total for a single-class character, so
// a single-class existing target derives newLevel from hitDice.total (precedent:
// the prepared-cap re-read in applySpellcastingOpInTx).
export async function resolveLevelUpContext(
  characterId: string,
  target: LevelUpTarget,
  subclassId?: string,
): Promise<LevelUpContext> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: {
      abilityScores: true,
      hitDice: true,
      // #1497: effectiveMaxHitPointsForRow's remaining inputs — the SAME
      // composition buildHpOpContext resolves for the commit path — so the
      // plan's hitPoints step can preview the post-level EFFECTIVE max rather
      // than the client re-deriving exhaustion's PHB'14 p. 291 halving.
      hitPoints: true,
      resources: true,
      conditions: true,
      experiencePoints: true,
      spellcasting: true,
      rulesEdition: true,
      classEntries: { orderBy: { position: "asc" }, select: TARGET_ENTRY_SELECT },
    },
  });
  if (!character) throw new InvalidLevelUpError(`Character not found: ${characterId}`);
  const edition = editionOf(character);
  const { hp: baselineHp, maxHpBonus, exhaustionLevel } = effectiveMaxHitPointsForRow(character);

  const isMulticlass = character.classEntries.length > 1;
  const hitDice = normalizeHitDice(character.hitDice);

  const {
    targetClassName, persistedSubclass, persistedSubclassId, newLevel, classId, targetIsPrimary,
    catalogHitDie, classFeatureRows, subclassFeatureRows,
  } = await resolveTargetEntry(target, character.classEntries, isMulticlass, hitDice.total);

  // #1380: resolved through the same function applyLevelUpOp uses, so the plan's
  // previewed gain and the committed gain can't be resolved off different dice.
  const { die: hitDie } = advancingHitDie(catalogHitDie, hitDice.die);

  const { subclassLevel, extraAsiLevels, fightingStyleFeatLevel } = await targetClassCatalogFor(classId, targetClassName, edition);

  const { chosenSubclassName, pickedSubclassFeatureRows } = await resolvePickedSubclass(subclassId, edition);
  // #1631: widen the newSpells step's choosable pool against the EFFECTIVE
  // subclass — see effectiveSubclassId's own comment.
  const subclassSpellListExpansionIds = await loadSubclassSpellListExpansionIds(
    effectiveSubclassId(subclassId, persistedSubclassId),
    edition,
  );

  return {
    planCharacter: {
      abilityScores: character.abilityScores as Record<string, number>,
      classEntries: character.classEntries.map((e) => ({ name: e.name, subclass: e.subclass, level: e.level })),
      // #1101: the known-spell list the validator checks a swap forget against.
      spellEntries: normalizeSpellcastingMutable(character.spellcasting).spells.map((s) => ({ id: s.id, level: s.level, source: s.source ?? null })),
      edition,
      hpBaseline: { rawMax: baselineHp.max, maxHpBonus, exhaustionLevel },
    },
    targetEntry: {
      name: targetClassName,
      subclass: persistedSubclass,
      newLevel,
      subclassLevel,
      hitDie,
      extraAsiLevels,
      fightingStyleFeatLevel,
      classFeatureRows,
      subclassFeatureRows,
      subclassSpellListExpansionIds,
    },
    chosenSubclassName,
    targetIsPrimary,
    pickedSubclassFeatureRows,
  };
}

// One builder per plan-step kind → the tagged ops that satisfy it. The validator
// already asserted counts, so these just project the (validated) submission fields.
// HP is first in plan order so it consumes the pending level before later in-tx
// re-reads (maneuver counts, subclass gating) observe the new hitDice.total.
const STEP_OP_BUILDERS: Record<LevelUpStepKind, (submission: LevelUpSubmission, step: LevelUpStep) => LevelUpTxOp[]> = {
  hitPoints: (s) => [{ domain: "hp", op: { type: "levelUp", method: s.hp.method, roll: s.hp.roll, target: s.target } }],
  advancement: (s) => [{ domain: "advancement", op: s.advancement! }],
  subclass: (s) => [{ domain: "class", op: { type: "setSubclass", subclassId: s.subclassId! } }],
  // #1137: force the fs slot so the pick lands in the fightingStyle partition.
  fightingStyleFeat: (s) => [{ domain: "advancement", op: { ...s.fightingStyleFeat!, slot: "fightingStyle" } }],
  // #1516: forgets apply BEFORE learns (ops run sequentially in tx order),
  // mirroring subclassChoice's own forget-before-learn ordering above.
  maneuvers: (s) =>
    [...(s.maneuversForgotten ?? []), ...(s.maneuvers ?? [])].map((op) => ({ domain: "resources", op })),
  toolProficiency: (s) => (s.toolProficiencies ?? []).map((op) => ({ domain: "resources", op })),
  // #1503: forgets apply BEFORE learns (ops run sequentially in tx order),
  // mirroring #1101's newSpells ordering — resolveChoiceOption's dup guard
  // reads the CURRENT known list, so a forget-first ordering lets a swap
  // proceed cleanly even in the (RAW-disallowed but not worth special-casing)
  // edge of re-picking the same option.
  subclassChoice: (s, step) => [
    ...(s.subclassChoicesForgotten ?? []).filter((c) => c.choiceKey === step.meta?.key),
    ...(s.subclassChoices ?? []).filter((c) => c.choiceKey === step.meta?.key),
  ].map((op) => ({ domain: "resources", op })),
  // #1101: forgets apply BEFORE learns (ops run sequentially in tx order), so a
  // swap can re-learn the just-forgotten spellId without tripping the dup guard.
  // #1131: cantrips are ordinary learns applied first (disjoint from the swap).
  newSpells: (s) =>
    [...(s.cantripsLearned ?? []), ...(s.spellsForgotten ?? []), ...(s.spellsLearned ?? [])].map((op) => ({ domain: "spellcasting", op })),
  review: () => [],
};

// Walk the validated steps in canonical plan order, projecting each to its ops.
function buildLevelUpOps(steps: LevelUpStep[], submission: LevelUpSubmission): LevelUpTxOp[] {
  return steps.flatMap((step) => STEP_OP_BUILDERS[step.kind](submission, step));
}

// Domain → seam. Only spellcasting consumes userId (as the casting user).
const LEVEL_UP_OP_APPLIERS: Record<
  LevelUpTxOp["domain"],
  (tx: Prisma.TransactionClient, id: string, op: LevelUpTxOp["op"], batchId: string, sessionId: string | null, userId: string) => Promise<unknown>
> = {
  hp: (tx, id, op, batchId, sessionId) => applyLevelUpHpInTx(tx, id, op as LevelUpOperation, batchId, sessionId),
  advancement: (tx, id, op, batchId, sessionId) => applyAdvancementOpInTx(tx, id, op as AdvancementOperation, batchId, sessionId),
  class: (tx, id, op, batchId, sessionId) => setSubclassInTx(tx, id, op as SetSubclassOperation, batchId, sessionId),
  // #1516: allowChooseNForget=true — every resources op reaching this call
  // site was already projected from steps validateLevelUpSubmission proved
  // legal (assertManeuverForgets/assertSubclassChoiceForgets ran first), so a
  // forgetManeuver/forgetSubclassChoice op here is always pre-validated.
  resources: (tx, id, op, batchId, sessionId) =>
    applyResourceOpInTx(tx, id, op as ResourceOperation, batchId, sessionId, true),
  spellcasting: (tx, id, op, batchId, sessionId, userId) =>
    applySpellcastingOpInTx(tx, id, op as SpellcastingOperation, batchId, sessionId, userId),
};

type SpellPickRow = { id: string; name: string; level: number; classes: string[] };

// One catalog read validates every id list before the tx opens (the count
// check in validateLevelUpSubmission can't see spell levels/classes). Returns
// the row lookup plus a level resolver keyed on each pick's catalog id.
async function loadPickCatalogRows(
  cantripOps: LearnSpellOperation[],
  spellOps: LearnSpellOperation[],
  edition: RulesEdition,
): Promise<{ rowById: Map<string, SpellPickRow>; levelOf: (op: LearnSpellOperation) => number | undefined }> {
  const ids = [...cantripOps, ...spellOps].map((o) => o.spellId);
  const rows = ids.length
    ? await prisma.spell.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, level: true, edition: true, ...SPELL_CLASS_MEMBERSHIP_SELECT },
      })
    : [];
  // #1712: reject an id that's provably the WRONG edition's fork before it
  // ever reaches assertOnSpellList/assertCantripEligibility below — see
  // rejectCrossEditionSpellForks's own comment for why this doesn't reject
  // every 2014 pick just because today's catalog is 2024-tagged (would
  // regress #1729's shipped 2014 known-caster level-up).
  const forkError = await rejectCrossEditionSpellForks(rows, edition);
  if (forkError) throw new InvalidLevelUpError(forkError);
  // Flattened to SpellPickRow's `classes: string[]` here (#1711) so the
  // eligibility checks below (assertOnSpellList, assertCantripEligibility)
  // never see the join shape — one seam resolves membership, not two.
  const rowById = new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, level: r.level, classes: classesOf(r) }]));
  const levelOf = (op: LearnSpellOperation): number | undefined => rowById.get(op.spellId)?.level;
  return { rowById, levelOf };
}

// #1131: cantrip picks must reference level-0 spells and leveled picks
// level-1+ — the pre-existing check, kept in its own function (predates #1440's
// class-list/ceiling additions below) so that provenance stays clear.
function assertCantripVsLeveledPlacement(
  cantripOps: LearnSpellOperation[],
  spellOps: LearnSpellOperation[],
  levelOf: (op: LearnSpellOperation) => number | undefined,
): void {
  for (const op of cantripOps) {
    const level = levelOf(op);
    if (level !== undefined && level !== 0) {
      throw new InvalidLevelUpError("Only cantrips (level 0) may be chosen as new cantrips.");
    }
  }
  for (const op of spellOps) {
    if (levelOf(op) === 0) {
      throw new InvalidLevelUpError("A cantrip cannot be chosen as a leveled spell.");
    }
  }
}

// Capitalizes one served class-list entry for display — matches the
// capitalization the frontend's spellListsLabel applies to the same lists.
function capitalizeClassName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Message-only phrasing for the leveled-spell rejection below: names the single
// class list normally, or the full served list — capitalized, Oxford-comma
// "or"-joined — when Magical Secrets widened it (2024 Bard 10+,
// spellLists.length > 1). A player sees this text on the 400, in the same
// moment the level-up banner would render spellListsLabel(spellLists)
// (frontend) for that same served list — "not on the bard, cleric, druid,
// wizard spell lists" would both misstate what was checked (it reads as if
// only "bard" mattered) and visibly disagree with the banner's "Bard, Cleric,
// Druid, or Wizard". Deliberately duplicated here rather than imported:
// spellListsLabel lives in a frontend module, and backend rules code must not
// depend across that tier boundary. Keep the two phrasings in sync by hand.
// `noun` is "spell" for a leveled pick and "cantrip" for a cantrip pick — the
// two facets name different lists (#1440: an Eldritch Knight's cantripLists is
// ["wizard"], not its base class), so the rejection must read "the Wizard
// cantrip list", never the base class name.
function classListPhrase(lists: string[], noun: "spell" | "cantrip" = "spell"): string {
  const names = lists.map(capitalizeClassName);
  // Defensive, not reachable today: spellListsFor always returns at least
  // [key], never [] — mirrors the identical guard in spellListsLabel (frontend).
  if (names.length === 0) return `the ${noun} list`;
  if (names.length <= 1) return `the ${names[0]} ${noun} list`;
  const joined = names.length === 2
    ? `${names[0]} or ${names[1]}`
    : `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
  return `the ${joined} ${noun} lists`;
}

// #1440: the served ceiling (meta.maxSpellLevel) applies to every leveled pick.
function assertWithinCeiling(row: SpellPickRow, maxSpellLevel: number): void {
  if (row.level > maxSpellLevel) {
    throw new InvalidLevelUpError(`${row.name} exceeds the highest spell level you can learn (${maxSpellLevel}).`);
  }
}

// #1440: unless spellLists is unrestricted, a catalog leveled pick must be on
// one of the served class lists. `null` means unrestricted — branch on
// `=== null`, never truthiness, since `[]` is truthy.
// `expandedSpellIds` (#1631) admits a row NOT on the class's own list when
// the subclass's list-expansion adds it (PHB'14 Warlock patrons) — the SAME
// widening creationPickError applies at creation.
function assertOnSpellList(row: SpellPickRow, spellLists: string[] | null, expandedSpellIds: string[]): void {
  if (spellLists !== null && !row.classes.some((c) => spellLists.includes(c)) && !expandedSpellIds.includes(row.id)) {
    throw new InvalidLevelUpError(`${row.name} is not on ${classListPhrase(spellLists)}.`);
  }
}

// #1440: leveled picks must clear both assertWithinCeiling and assertOnSpellList.
// Unknown ids `continue` so applyLearnSpellOp's own not-found error stays the
// one thrown when the tx runs (the atomicity test depends on this: a bogus id
// must reach the tx, not be pre-empted here).
function assertLeveledSpellEligibility(
  spellOps: LearnSpellOperation[],
  rowById: Map<string, SpellPickRow>,
  maxSpellLevel: number,
  spellLists: string[] | null,
  expandedSpellIds: string[],
): void {
  for (const op of spellOps) {
    const row = rowById.get(op.spellId);
    if (!row) continue; // unknown id — fall through to applyLearnSpellOp's not-found error
    assertWithinCeiling(row, maxSpellLevel);
    assertOnSpellList(row, spellLists, expandedSpellIds);
  }
}

// #1440: cantrip picks are gated on the served meta.cantripLists — a SEPARATE
// served value from spellLists, because 2024 Magical Secrets broadens spells
// but not cantrips (the trigger is the Prepared Spells number, level 1+ only)
// while a qualifying 2014 Bard is unrestricted on both (PHB'14 p. 54 "...or a
// cantrip"). The rejection names cantripLists via classListPhrase — the SAME
// treatment assertOnSpellList gives the leveled pick — so an Eldritch Knight's
// message reads "the Wizard cantrip list", not its base "fighter" list, and a
// future multi-entry cantripLists (2024 College of Lore Magical Discoveries,
// PHB'14 Additional Magical Secrets) is phrased correctly for free.
function assertCantripEligibility(
  cantripOps: LearnSpellOperation[],
  rowById: Map<string, SpellPickRow>,
  cantripLists: string[] | null,
): void {
  for (const op of cantripOps) {
    const row = rowById.get(op.spellId);
    if (!row) continue; // unknown id — fall through to applyLearnSpellOp's not-found error
    if (cantripLists !== null && !row.classes.some((c) => cantripLists.includes(c))) {
      throw new InvalidLevelUpError(`${row.name} is not on ${classListPhrase(cantripLists, "cantrip")}.`);
    }
  }
}

interface NewSpellsGate {
  maxSpellLevel: number;
  spellLists: string[] | null;
  cantripLists: string[] | null;
  // #1631: leveled-pick ids the subclass's list-expansion admits, alongside
  // spellLists — see newSpellsStep (level-up-plan.ts)'s own comment.
  expandedSpellIds: string[];
}

// Reads the served eligibility facts off the newSpells step — the server-BUILT
// plan step, never a client-supplied field (CLAUDE.md: never let a
// client-computed value be trusted by a transaction endpoint), and never
// re-deriving spellListsFor here. Returns null when the level-up has
// no newSpells step (assertNoExcess/assertCantrips already rejected any pick in
// that case, so there's nothing left to gate).
// #1631: split out of resolveNewSpellsGate purely to keep that function's own
// cyclomatic count from crossing the CI health gate.
function expandedSpellIdsOf(step: LevelUpStep): string[] {
  return (step.meta?.expandedSpellIds as string[] | undefined) ?? [];
}

function resolveNewSpellsGate(steps: LevelUpStep[]): NewSpellsGate | null {
  const step = steps.find((s): s is LevelUpStep & { kind: "newSpells" } => s.kind === "newSpells");
  if (!step) return null;
  return {
    maxSpellLevel: typeof step.meta?.maxSpellLevel === "number" ? step.meta.maxSpellLevel : 0,
    spellLists: (step.meta?.spellLists as string[] | null | undefined) ?? null,
    cantripLists: (step.meta?.cantripLists as string[] | null | undefined) ?? null,
    expandedSpellIds: expandedSpellIdsOf(step),
  };
}

// Orchestrates the #1440 eligibility gate: read the catalog once, apply the
// pre-existing cantrip/leveled placement check, then gate leveled picks on the
// served ceiling + spellLists and cantrip picks on cantripLists.
async function assertPickSpellEligibility(
  submission: LevelUpSubmission,
  steps: LevelUpStep[],
  edition: RulesEdition,
): Promise<void> {
  const cantripOps = submission.cantripsLearned ?? [];
  const spellOps = submission.spellsLearned ?? [];
  const { rowById, levelOf } = await loadPickCatalogRows(cantripOps, spellOps, edition);
  assertCantripVsLeveledPlacement(cantripOps, spellOps, levelOf);

  const gate = resolveNewSpellsGate(steps);
  if (!gate) return;

  assertLeveledSpellEligibility(spellOps, rowById, gate.maxSpellLevel, gate.spellLists, gate.expandedSpellIds);
  assertCantripEligibility(cantripOps, rowById, gate.cantripLists);
}

/**
 * Validate `submission` against the character's derived level-up plan and apply
 * every resulting choice (hit points, advancement, subclass, subclass-derived
 * choices, new spells) atomically under one batchId. Throws InvalidLevelUpError
 * for any resolution/validation failure; each seam throws its own domain error on
 * an invalid op, rolling back the whole batch.
 *
 * #1440: assertPickSpellEligibility gates spellsLearned/cantripsLearned against
 * the server-BUILT `steps` (the same plan the GET /plan route served) — never a
 * client-supplied field — satisfying CLAUDE.md's "never let a client-computed
 * value be trusted by a transaction endpoint".
 */
export async function applyLevelUpTransaction(
  characterId: string,
  submission: LevelUpSubmission,
  userId: string,
): Promise<void> {
  const { planCharacter, targetEntry, chosenSubclassName, pickedSubclassFeatureRows } =
    await resolveLevelUpContext(characterId, submission.target, submission.subclassId);

  const steps = validateLevelUpSubmission(planCharacter, targetEntry, chosenSubclassName, submission, pickedSubclassFeatureRows);
  await assertPickSpellEligibility(submission, steps, planCharacter.edition);

  const ops = buildLevelUpOps(steps, submission);

  await runCharacterTransaction(characterId, ops, {
    select: { id: true },
    notFound: (id) => new InvalidLevelUpError(`Character not found: ${id}`),
    applyOp: ({ tx, op, characterId: id, batchId, sessionId }) =>
      LEVEL_UP_OP_APPLIERS[op.domain](tx, id, op.op, batchId, sessionId, userId).then(() => undefined),
  });
}
