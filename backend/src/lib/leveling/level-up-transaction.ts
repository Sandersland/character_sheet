// Composition seam (#885): applies a validated submission's steps under ONE batchId in ONE runCharacterTransaction. No 5e rules live here — delegated to the validator/plan and the *InTx seams.
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
import type { SubclassCasterRef } from "@/lib/srd/spellcasting-tables.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";
import { FEATURE_ROWS_CLASS_FEATURES, FEATURE_ROWS_SUBCLASS_FEATURES } from "@/lib/classes/feature-rows-select.js";

// A validated step, mapped to the seam that applies it. Each domain re-reads its own state via `tx`, so a later op sees the earlier op's write (e.g. the maneuver steps see the subclass the earlier `class` op set on the primary entry).
type LevelUpTxOp =
  | { domain: "hp"; op: LevelUpOperation }
  | { domain: "advancement"; op: AdvancementOperation }
  | { domain: "class"; op: SetSubclassOperation }
  | { domain: "resources"; op: ResourceOperation }
  | { domain: "spellcasting"; op: SpellcastingOperation };

export interface LevelUpContext {
  planCharacter: LevelUpPlanCharacter;
  targetEntry: TargetClassEntry;
  chosenSubclassName: string | null;
  // Display-only (#1177) — surfaced on the plan route's `target.isPrimary`.
  targetIsPrimary: boolean;
  // #1546: the not-yet-committed `?subclassId=` pick's own feature rows (null when no subclassId was submitted). Fed to resolveLevelUpPlan by every caller of this context.
  pickedSubclassFeatureRows: ClassFeatureRow[] | null;
  // #1531: the not-yet-committed pick's own casterFraction/spellcastingAbility, mirrored on targetEntry.subclassCasterRef. Fed to resolveLevelUpPlan so a FIRST-time EK/AT pick resolves its own newSpells step correctly on re-plan.
  chosenSubclassCasterRef: SubclassCasterRef | null;
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
      // hitDie (#1380): the same shape buildHpOpContext selects for the commit path.
      // features (#1546): the class's own rows — see FEATURE_ROWS_CLASS_FEATURES.
      // name/extraAsiLevels/fightingStyleFeatLevel/subclassLevel (#1497/#1123/#1148): effectiveMaxHitPointsForRow/draconicResilienceMaxHpTerm/characterFightingStyleFeatSlots inputs — `name` is the canonical class name (#1495).
      hitDie: true,
      features: FEATURE_ROWS_CLASS_FEATURES,
      name: true,
      extraAsiLevels: true,
      fightingStyleFeatLevel: true,
      subclassLevel: true,
    },
  },
  // subclassRef (#1546): the PERSISTED subclass's own feature rows, absent when unset. id (#1631): loadSubclassSpellListExpansionIds' key.
  // slug (#1123): draconicResilienceMaxHpTerm's FK identity input. casterFraction/spellcastingAbility (#1531): newSpellsStep's third-caster resolution.
  subclassRef: {
    select: { id: true, slug: true, casterFraction: true, spellcastingAbility: true, features: FEATURE_ROWS_SUBCLASS_FEATURES },
  },
} satisfies Prisma.CharacterClassEntrySelect;

// #1529/#1308: subclassLevel resolves through subclassGateLevel (a 2014-only catalog column; subclassStep must never compare the raw value). extraAsiLevels/fightingStyleFeatLevel carry no edition fork and pass through as-is; `[]`/`null` for a homebrew class matches advancementSlotsForLevel/fightingStyleFeatSlots' own fallback.
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

interface ResolvedTargetEntry {
  targetClassName: string;
  persistedSubclass: string | null;
  // #1148: the PERSISTED subclass's own FK slug — resolveSubclassSlug's preferred identity path (#1277) over the drift-prone free-text name.
  persistedSubclassRef: { slug: string } | null;
  // #1531: the PERSISTED subclass's own casterFraction/spellcastingAbility, fed to newSpellsStep via TargetClassEntry.subclassCasterRef.
  persistedSubclassCasterRef: SubclassCasterRef | null;
  // #1631: the PERSISTED subclass's own catalog id — null when unset. Distinct from persistedSubclass (a name) since loadSubclassSpellListExpansionIds keys on id.
  persistedSubclassId: string | null;
  newLevel: number;
  classId: string | null;
  targetIsPrimary: boolean;
  // The advancing class's own catalog die; null falls back to hitDice.die at the call site.
  catalogHitDie: string | null;
  // #1546: the PERSISTED half of the featureRows carrier. subclassFeatureRows is empty for a brand-new entry or an existing entry with no subclass chosen. Cast mirrors featureRowsOf's own (feature-rows-select.ts) — Prisma types these fields as opaque JsonValue.
  classFeatureRows: ClassFeatureRow[];
  subclassFeatureRows: ClassFeatureRow[];
}

// #1148: the CANONICAL catalog class name (entry.class.name), never entry.name — a free-to-diverge display name (#1495). resolveSubclassSlug's FK-first path requires the classKey it's called with to match SUBCLASS_IDENTITY's classKey or the FK is silently rejected.
function canonicalClassNameOf(entry: TargetEntryRow): string {
  return entry.class?.name ?? entry.name;
}

// The three PERSISTED-subclass facts, bundled behind ONE null guard: the catalog id (#1631), the FK slug (#1148), and the third-caster identity (#1531) are null together — there is no partially-persisted state.
function persistedSubclassDataOf(
  entry: TargetEntryRow,
): { id: string | null; ref: { slug: string } | null; casterRef: SubclassCasterRef | null } {
  if (!entry.subclassRef) return { id: null, ref: null, casterRef: null };
  const { id, slug, casterFraction, spellcastingAbility } = entry.subclassRef;
  return { id, ref: { slug }, casterRef: { casterFraction, spellcastingAbility } };
}

function resolveExistingTargetEntry(
  target: Extract<LevelUpTarget, { kind: "existing" }>,
  classEntries: TargetEntryRow[],
  isMulticlass: boolean,
  hitDiceTotal: number,
): ResolvedTargetEntry {
  const entry = classEntries.find((e) => e.id === target.classEntryId);
  if (!entry) throw new InvalidLevelUpError(`Class entry not found: ${target.classEntryId}`);
  const subclassData = persistedSubclassDataOf(entry);
  return {
    targetClassName: canonicalClassNameOf(entry),
    persistedSubclass: entry.subclass,
    persistedSubclassRef: subclassData.ref,
    persistedSubclassCasterRef: subclassData.casterRef,
    persistedSubclassId: subclassData.id,
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
    persistedSubclassRef: null,
    persistedSubclassCasterRef: null,
    persistedSubclassId: null,
    newLevel: 1,
    classId: target.classId,
    targetIsPrimary: false,
    catalogHitDie: catalog.hitDie,
    classFeatureRows: catalog.features as unknown as ClassFeatureRow[],
    subclassFeatureRows: [],
  };
}

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

async function resolvePickedSubclass(
  subclassId: string | undefined,
  edition: RulesEdition,
): Promise<{
  chosenSubclassName: string | null;
  pickedSubclassFeatureRows: ClassFeatureRow[] | null;
  chosenSubclassCasterRef: SubclassCasterRef | null;
}> {
  if (!subclassId) return { chosenSubclassName: null, pickedSubclassFeatureRows: null, chosenSubclassCasterRef: null };
  // #1414: cross-edition checked before membership — a wrong-edition row is "not in this character's catalog at all". Membership stays one copy of the rule; applySetSubclass re-validates it in-tx.
  const sub = await prisma.subclass.findUnique({
    where: { id: subclassId },
    select: { name: true, edition: true, casterFraction: true, spellcastingAbility: true, features: FEATURE_ROWS_SUBCLASS_FEATURES },
  });
  if (!sub) throw new InvalidLevelUpError(`Subclass not found: ${subclassId}`);
  const mismatch = crossEditionRejection(sub, `Subclass "${sub.name}"`, edition);
  if (mismatch) throw new InvalidLevelUpError(mismatch);
  return {
    chosenSubclassName: sub.name,
    pickedSubclassFeatureRows: sub.features as unknown as ClassFeatureRow[],
    chosenSubclassCasterRef: { casterFraction: sub.casterFraction, spellcastingAbility: sub.spellcastingAbility },
  };
}

// #1631: the EFFECTIVE subclass id newSpells widens against — the not-yet-committed pick when this level-up sets a new subclass, else the persisted one. Mirrors resolveLevelUpPlan's own precedence.
function effectiveSubclassId(subclassId: string | undefined, persistedSubclassId: string | null): string | null {
  return subclassId ?? persistedSubclassId;
}

// The per-entry `level` column can lag hitDice.total for a single-class character, so a single-class existing target derives newLevel from hitDice.total (precedent: the prepared-cap re-read in applySpellcastingOpInTx).
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
      // #1497: effectiveMaxHitPointsForRow's remaining inputs — the same composition buildHpOpContext resolves for the commit path.
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
    targetClassName, persistedSubclass, persistedSubclassRef, persistedSubclassCasterRef, persistedSubclassId, newLevel, classId, targetIsPrimary,
    catalogHitDie, classFeatureRows, subclassFeatureRows,
  } = await resolveTargetEntry(target, character.classEntries, isMulticlass, hitDice.total);

  // #1380: resolved through the same function applyLevelUpOp uses, so the plan's previewed gain and the committed gain can't be resolved off different dice.
  const { die: hitDie } = advancingHitDie(catalogHitDie, hitDice.die);

  const { subclassLevel, extraAsiLevels, fightingStyleFeatLevel } = await targetClassCatalogFor(classId, targetClassName, edition);

  const { chosenSubclassName, pickedSubclassFeatureRows, chosenSubclassCasterRef } = await resolvePickedSubclass(subclassId, edition);
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
      subclassRef: persistedSubclassRef,
      subclassCasterRef: persistedSubclassCasterRef,
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
    chosenSubclassCasterRef,
  };
}

// The validator already asserted counts; these just project validated fields. HP is first in plan order so it consumes the pending level before later in-tx re-reads (maneuver counts, subclass gating) observe the new hitDice.total.
const STEP_OP_BUILDERS: Record<LevelUpStepKind, (submission: LevelUpSubmission, step: LevelUpStep) => LevelUpTxOp[]> = {
  hitPoints: (s) => [{ domain: "hp", op: { type: "levelUp", method: s.hp.method, roll: s.hp.roll, target: s.target } }],
  advancement: (s) => [{ domain: "advancement", op: s.advancement! }],
  subclass: (s) => [{ domain: "class", op: { type: "setSubclass", subclassId: s.subclassId! } }],
  // #1137: force the fs slot so the pick lands in the fightingStyle partition.
  fightingStyleFeat: (s) => [{ domain: "advancement", op: { ...s.fightingStyleFeat!, slot: "fightingStyle" } }],
  // #1516: forgets apply BEFORE learns, mirroring subclassChoice's own forget-before-learn ordering above.
  maneuvers: (s) =>
    [...(s.maneuversForgotten ?? []), ...(s.maneuvers ?? [])].map((op) => ({ domain: "resources", op })),
  toolProficiency: (s) => (s.toolProficiencies ?? []).map((op) => ({ domain: "resources", op })),
  expertise: (s) => (s.expertise ?? []).map((op) => ({ domain: "resources", op })),
  // #1503: forgets apply BEFORE learns — resolveChoiceOption's dup guard reads the CURRENT known list, so a forget-first ordering lets a swap proceed cleanly even when re-picking the same option.
  subclassChoice: (s, step) => [
    ...(s.subclassChoicesForgotten ?? []).filter((c) => c.choiceKey === step.meta?.key),
    ...(s.subclassChoices ?? []).filter((c) => c.choiceKey === step.meta?.key),
  ].map((op) => ({ domain: "resources", op })),
  // #1101: forgets apply BEFORE learns, so a swap can re-learn the just-forgotten spellId without tripping the dup guard. #1131: cantrips are ordinary learns applied first (disjoint from the swap).
  newSpells: (s) =>
    [...(s.cantripsLearned ?? []), ...(s.spellsForgotten ?? []), ...(s.spellsLearned ?? [])].map((op) => ({ domain: "spellcasting", op })),
  review: () => [],
};

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
  // #1516: allowChooseNForget=true — every resources op reaching this call site was already projected from steps validateLevelUpSubmission proved legal, so a forgetManeuver/forgetSubclassChoice op here is always pre-validated.
  resources: (tx, id, op, batchId, sessionId) =>
    applyResourceOpInTx(tx, id, op as ResourceOperation, batchId, sessionId, true),
  spellcasting: (tx, id, op, batchId, sessionId, userId) =>
    applySpellcastingOpInTx(tx, id, op as SpellcastingOperation, batchId, sessionId, userId),
};

type SpellPickRow = { id: string; name: string; level: number; classes: string[]; school: string };

// One catalog read validates every id list before the tx opens (the count check in validateLevelUpSubmission can't see spell levels/classes).
async function loadPickCatalogRows(
  cantripOps: LearnSpellOperation[],
  spellOps: LearnSpellOperation[],
  edition: RulesEdition,
): Promise<{ rowById: Map<string, SpellPickRow>; levelOf: (op: LearnSpellOperation) => number | undefined }> {
  const ids = [...cantripOps, ...spellOps].map((o) => o.spellId);
  const rows = ids.length
    ? await prisma.spell.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, level: true, edition: true, school: true, ...SPELL_CLASS_MEMBERSHIP_SELECT },
      })
    : [];
  // #1712: reject an id that's provably the WRONG edition's fork before assertOnSpellList/assertCantripEligibility below — must not reject every 2014 pick just because today's catalog is 2024-tagged (would regress #1729's shipped 2014 known-caster level-up).
  const forkError = await rejectCrossEditionSpellForks(rows, edition);
  if (forkError) throw new InvalidLevelUpError(forkError);
  // Flattened to SpellPickRow's `classes: string[]` here (#1711) so the eligibility checks below never see the join shape — one seam resolves membership, not two. `school` (#1855): the Eldritch Knight spell-school gate's own input.
  const rowById = new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, level: r.level, classes: classesOf(r), school: r.school }]));
  const levelOf = (op: LearnSpellOperation): number | undefined => rowById.get(op.spellId)?.level;
  return { rowById, levelOf };
}

// #1131: cantrip picks must reference level-0 spells; leveled picks must be level-1+.
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

// Matches the capitalization the frontend's spellListsLabel applies to the same lists.
function capitalizeClassName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Oxford-comma "a, b, or c" join shared by classListPhrase/schoolListPhrase; each caller keeps its own surrounding wrapping.
function oxfordOr(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return names.length === 2
    ? `${names[0]} or ${names[1]}`
    : `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}

// Deliberately duplicated rather than imported: spellListsLabel lives in a frontend module and backend rules code must not depend across that tier boundary. Keep the two phrasings in sync by hand.
// `noun` is "spell" for a leveled pick, "cantrip" for a cantrip pick — the two facets name different lists (#1440: an EK's cantripLists is ["wizard"], not its base class).
function classListPhrase(lists: string[], noun: "spell" | "cantrip" = "spell"): string {
  const names = lists.map(capitalizeClassName);
  // Defensive, not reachable today: spellListsFor always returns at least [key], never [] — mirrors the identical guard in spellListsLabel (frontend).
  if (names.length === 0) return `the ${noun} list`;
  if (names.length <= 1) return `the ${names[0]} ${noun} list`;
  return `the ${oxfordOr(names)} ${noun} lists`;
}

// #1440: the served ceiling (meta.maxSpellLevel) applies to every leveled pick.
function assertWithinCeiling(row: SpellPickRow, maxSpellLevel: number): void {
  if (row.level > maxSpellLevel) {
    throw new InvalidLevelUpError(`${row.name} exceeds the highest spell level you can learn (${maxSpellLevel}).`);
  }
}

// #1440: unless spellLists is unrestricted (`null`; branch on `=== null`, never truthiness, since `[]` is truthy), a leveled pick must be on a served class list. `expandedSpellIds` (#1631) admits a subclass list-expansion row (PHB'14 Warlock patrons) — the same widening creationPickError applies at creation.
function assertOnSpellList(row: SpellPickRow, spellLists: string[] | null, expandedSpellIds: string[]): void {
  if (spellLists !== null && !row.classes.some((c) => spellLists.includes(c)) && !expandedSpellIds.includes(row.id)) {
    throw new InvalidLevelUpError(`${row.name} is not on ${classListPhrase(spellLists)}.`);
  }
}

// #1855: Oxford-comma phrase for the Eldritch Knight spell-school gate's rejection message ("Abjuration or Evocation") — names schools, never a class list.
function schoolListPhrase(schools: string[]): string {
  return oxfordOr(schools.map(capitalizeClassName));
}

// #1855: PHB'14 p. 74 Eldritch Knight Spellcasting — every leveled pick must be on `spellSchools`, except up to `freeSchoolPicks`, consumed in submission order. A swap's replacement pick rides the same `spellsLearned` array and is gated identically.
function assertSpellSchoolEligibility(
  spellOps: LearnSpellOperation[],
  rowById: Map<string, SpellPickRow>,
  spellSchools: string[] | null,
  freeSchoolPicks: number,
): void {
  if (spellSchools === null) return;
  let freeRemaining = freeSchoolPicks;
  for (const op of spellOps) {
    const row = rowById.get(op.spellId);
    if (!row) continue; // unknown id — fall through to applyLearnSpellOp's not-found error
    if (spellSchools.includes(row.school)) continue;
    if (freeRemaining > 0) {
      freeRemaining -= 1;
      continue;
    }
    throw new InvalidLevelUpError(`${row.name} must be an ${schoolListPhrase(spellSchools)} spell.`);
  }
}

// Unknown ids `continue` so applyLearnSpellOp's own not-found error stays the one thrown when the tx runs — the atomicity test depends on this.
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

// #1440: cantrip picks gate on the served meta.cantripLists — separate from spellLists because 2024 Magical Secrets broadens spells but not cantrips, while a qualifying 2014 Bard is unrestricted on both (PHB'14 p. 54 "...or a cantrip"). Rejection names cantripLists via classListPhrase so an Eldritch Knight's message reads "the Wizard cantrip list", not its base class.
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
  // #1631: leveled-pick ids the subclass's list-expansion admits, alongside spellLists.
  expandedSpellIds: string[];
  // #1855: Eldritch Knight (2014) leveled-pick school gate — null/0 for every other class/edition.
  spellSchools: string[] | null;
  freeSchoolPicks: number;
}

function expandedSpellIdsOf(step: LevelUpStep): string[] {
  return (step.meta?.expandedSpellIds as string[] | undefined) ?? [];
}

function spellSchoolGateOf(step: LevelUpStep): Pick<NewSpellsGate, "spellSchools" | "freeSchoolPicks"> {
  return {
    spellSchools: (step.meta?.spellSchools as string[] | null | undefined) ?? null,
    freeSchoolPicks: typeof step.meta?.freeSchoolPicks === "number" ? step.meta.freeSchoolPicks : 0,
  };
}

// Reads eligibility facts off the server-BUILT newSpells step, never a client-supplied field. Returns null when there's no newSpells step (assertNoExcess/assertCantrips already rejected any pick in that case).
function resolveNewSpellsGate(steps: LevelUpStep[]): NewSpellsGate | null {
  const step = steps.find((s): s is LevelUpStep & { kind: "newSpells" } => s.kind === "newSpells");
  if (!step) return null;
  return {
    maxSpellLevel: typeof step.meta?.maxSpellLevel === "number" ? step.meta.maxSpellLevel : 0,
    spellLists: (step.meta?.spellLists as string[] | null | undefined) ?? null,
    cantripLists: (step.meta?.cantripLists as string[] | null | undefined) ?? null,
    expandedSpellIds: expandedSpellIdsOf(step),
    ...spellSchoolGateOf(step),
  };
}

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
  assertSpellSchoolEligibility(spellOps, rowById, gate.spellSchools, gate.freeSchoolPicks);
  assertCantripEligibility(cantripOps, rowById, gate.cantripLists);
}

// Applies every resulting choice atomically under one batchId; each seam throws its own domain error on an invalid op, rolling back the whole batch.
// #1440: assertPickSpellEligibility gates against the server-BUILT `steps`, never a client-supplied field.
export async function applyLevelUpTransaction(
  characterId: string,
  submission: LevelUpSubmission,
  userId: string,
): Promise<void> {
  const { planCharacter, targetEntry, chosenSubclassName, pickedSubclassFeatureRows, chosenSubclassCasterRef } =
    await resolveLevelUpContext(characterId, submission.target, submission.subclassId);

  const steps = validateLevelUpSubmission(planCharacter, targetEntry, chosenSubclassName, submission, pickedSubclassFeatureRows, chosenSubclassCasterRef);
  await assertPickSpellEligibility(submission, steps, planCharacter.edition);

  const ops = buildLevelUpOps(steps, submission);

  await runCharacterTransaction(characterId, ops, {
    select: { id: true },
    notFound: (id) => new InvalidLevelUpError(`Character not found: ${id}`),
    applyOp: ({ tx, op, characterId: id, batchId, sessionId }) =>
      LEVEL_UP_OP_APPLIERS[op.domain](tx, id, op.op, batchId, sessionId, userId).then(() => undefined),
  });
}
