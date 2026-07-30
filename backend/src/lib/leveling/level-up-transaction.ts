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
import {
  advancingHitDie,
  applyLevelUpHpInTx,
  normalizeHitDice,
} from "@/lib/combat/hitpoints.js";
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
}

const TARGET_ENTRY_SELECT = {
  id: true,
  name: true,
  subclass: true,
  level: true,
  position: true,
  classId: true,
  // #1380: the advancing class's catalog hit die, the same shape buildHpOpContext
  // selects for the commit path.
  class: { select: { hitDie: true } },
} satisfies Prisma.CharacterClassEntrySelect;

// Fetch the target class's catalog subclassLevel and resolve it through the
// edition seam (#1308) — the column is 2014-only (subclassGateLevel hardcodes 3
// under 2024), so subclassStep must never compare against the raw column.
async function subclassLevelFor(classId: string | null, className: string, edition: RulesEdition): Promise<number> {
  const row = classId
    ? await prisma.characterClass.findUnique({ where: { id: classId }, select: { subclassLevel: true } })
    : await prisma.characterClass.findFirst({
        where: { name: { equals: className, mode: "insensitive" } },
        select: { subclassLevel: true },
      });
  return subclassGateLevel(row?.subclassLevel, edition);
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
      spellcasting: true,
      rulesEdition: true,
      classEntries: { orderBy: { position: "asc" }, select: TARGET_ENTRY_SELECT },
    },
  });
  if (!character) throw new InvalidLevelUpError(`Character not found: ${characterId}`);
  const edition = editionOf(character);

  const isMulticlass = character.classEntries.length > 1;
  const hitDice = normalizeHitDice(character.hitDice);
  let targetClassName: string;
  let persistedSubclass: string | null;
  let newLevel: number;
  let classId: string | null;
  let targetIsPrimary: boolean;
  // The advancing class's own catalog die; null falls back to hitDice.die below.
  let catalogHitDie: string | null;

  if (target.kind === "existing") {
    const entry = character.classEntries.find((e) => e.id === target.classEntryId);
    if (!entry) throw new InvalidLevelUpError(`Class entry not found: ${target.classEntryId}`);
    targetClassName = entry.name;
    persistedSubclass = entry.subclass;
    newLevel = isMulticlass ? entry.level + 1 : hitDice.total + 1;
    classId = entry.classId;
    targetIsPrimary = entry.position === 0;
    catalogHitDie = entry.class?.hitDie ?? null;
  } else {
    const catalog = await prisma.characterClass.findUnique({
      where: { id: target.classId },
      select: { name: true, hitDie: true },
    });
    if (!catalog) throw new InvalidLevelUpError(`Class not found: ${target.classId}`);
    targetClassName = catalog.name;
    persistedSubclass = null;
    newLevel = 1;
    classId = target.classId;
    targetIsPrimary = false; // a new multiclass entry is never the primary
    catalogHitDie = catalog.hitDie;
  }

  // #1380: resolved through the same function applyLevelUpOp uses, so the plan's
  // previewed gain and the committed gain can't be resolved off different dice.
  const { die: hitDie } = advancingHitDie(catalogHitDie, hitDice.die);

  const subclassLevel = await subclassLevelFor(classId, targetClassName, edition);

  let chosenSubclassName: string | null = null;
  if (subclassId) {
    // Cross-edition before membership: a wrong-edition row is "not in this
    // character's catalog at all" (#1414), the ordering applySetSubclass also
    // carries. Reuses the `edition` const bound above — never resolve edition
    // twice for one resolution. Membership stays one copy of the rule
    // (applySetSubclass re-validates it in-tx); here we only resolve id → name.
    const sub = await prisma.subclass.findUnique({
      where: { id: subclassId },
      select: { name: true, edition: true },
    });
    if (!sub) throw new InvalidLevelUpError(`Subclass not found: ${subclassId}`);
    const mismatch = crossEditionRejection(sub, `Subclass "${sub.name}"`, edition);
    if (mismatch) throw new InvalidLevelUpError(mismatch);
    chosenSubclassName = sub.name;
  }

  return {
    planCharacter: {
      abilityScores: character.abilityScores as Record<string, number>,
      classEntries: character.classEntries.map((e) => ({ name: e.name, subclass: e.subclass, level: e.level })),
      // #1101: the known-spell list the validator checks a swap forget against.
      spellEntries: normalizeSpellcastingMutable(character.spellcasting).spells.map((s) => ({ id: s.id, level: s.level, source: s.source ?? null })),
      edition,
    },
    targetEntry: { name: targetClassName, subclass: persistedSubclass, newLevel, subclassLevel, hitDie },
    chosenSubclassName,
    targetIsPrimary,
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
  maneuvers: (s) => (s.maneuvers ?? []).map((op) => ({ domain: "resources", op })),
  toolProficiency: (s) => (s.toolProficiencies ?? []).map((op) => ({ domain: "resources", op })),
  subclassChoice: (s, step) =>
    (s.subclassChoices ?? [])
      .filter((c) => c.choiceKey === step.meta?.key)
      .map((op) => ({ domain: "resources", op })),
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
  resources: (tx, id, op, batchId, sessionId) => applyResourceOpInTx(tx, id, op as ResourceOperation, batchId, sessionId),
  spellcasting: (tx, id, op, batchId, sessionId, userId) =>
    applySpellcastingOpInTx(tx, id, op as SpellcastingOperation, batchId, sessionId, userId),
};

type SpellPickRow = { id: string; name: string; level: number; classes: string[] };

// One catalog read validates every id list before the tx opens (the count
// check in validateLevelUpSubmission can't see spell levels/classes). Returns
// the row lookup plus a level resolver that also covers op.custom (a
// DM-authored custom pick carries its own level, with no catalog row).
async function loadPickCatalogRows(
  cantripOps: LearnSpellOperation[],
  spellOps: LearnSpellOperation[],
): Promise<{ rowById: Map<string, SpellPickRow>; levelOf: (op: LearnSpellOperation) => number | undefined }> {
  const ids = [...cantripOps, ...spellOps].map((o) => o.spellId).filter((id): id is string => Boolean(id));
  const rows = ids.length
    ? await prisma.spell.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, level: true, classes: true } })
    : [];
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const levelOf = (op: LearnSpellOperation): number | undefined =>
    op.spellId ? rowById.get(op.spellId)?.level : op.custom?.level;
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
    if (levelOf(op) !== undefined && levelOf(op) !== 0) {
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
function classListPhrase(spellLists: string[]): string {
  const names = spellLists.map(capitalizeClassName);
  // Defensive, not reachable today: magicalSecretsSpellLists always returns at
  // least [key], never [] — mirrors the identical guard in spellListsLabel (frontend).
  if (names.length === 0) return "the spell list";
  if (names.length <= 1) return `the ${names[0]} spell list`;
  const joined = names.length === 2
    ? `${names[0]} or ${names[1]}`
    : `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
  return `the ${joined} spell lists`;
}

// A leveled pick's effective level: the catalog row's, or op.custom's own
// (a DM-authored custom pick carries no catalog row).
function pickLevel(op: LearnSpellOperation, row: SpellPickRow | undefined): number | undefined {
  return row?.level ?? op.custom?.level;
}

// #1440: the served ceiling (meta.maxSpellLevel) applies to every leveled pick,
// including op.custom (a DM-authored spell has no catalog `classes` array, so
// it's exempt from assertOnSpellList below, but not from this).
function assertWithinCeiling(op: LearnSpellOperation, row: SpellPickRow | undefined, maxSpellLevel: number): void {
  const level = pickLevel(op, row);
  if (level !== undefined && level > maxSpellLevel) {
    throw new InvalidLevelUpError(`${row?.name ?? "That spell"} exceeds the highest spell level you can learn (${maxSpellLevel}).`);
  }
}

// #1440: unless spellLists is unrestricted, a catalog leveled pick must be on
// one of the served class lists. `null` means unrestricted — branch on
// `=== null`, never truthiness, since `[]` is truthy. op.custom has no
// `row`/`classes` and is exempt (checked only by assertWithinCeiling above).
function assertOnSpellList(row: SpellPickRow | undefined, spellLists: string[] | null): void {
  if (row && spellLists !== null && !row.classes.some((c) => spellLists.includes(c))) {
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
): void {
  for (const op of spellOps) {
    const row = op.spellId ? rowById.get(op.spellId) : undefined;
    if (op.spellId && !row) continue; // unknown id — fall through to applyLearnSpellOp's not-found error
    assertWithinCeiling(op, row, maxSpellLevel);
    assertOnSpellList(row, spellLists);
  }
}

// #1440: cantrip picks are gated on the served meta.cantripLists — a SEPARATE
// served value from spellLists, because 2024 Magical Secrets broadens spells
// but not cantrips (the trigger is the Prepared Spells number, level 1+ only)
// while a qualifying 2014 Bard is unrestricted on both (PHB'14 p. 54 "...or a
// cantrip"). The `.some()` check below handles a multi-entry cantripLists
// correctly regardless; per the current magicalSecretsSpellLists
// implementation cantripLists is always a single class or null, so the
// rejection message never needs to name more than one list — but that's an
// implementation fact, not a type guarantee. If a future subclass seam (2024
// College of Lore Magical Discoveries, PHB'14 Additional Magical Secrets)
// widens it to several, this message needs the same treatment as the leveled
// pick's rejection message (assertOnSpellList, via classListPhrase).
function assertCantripEligibility(
  cantripOps: LearnSpellOperation[],
  rowById: Map<string, SpellPickRow>,
  cantripLists: string[] | null,
  lowerClass: string,
): void {
  for (const op of cantripOps) {
    const row = op.spellId ? rowById.get(op.spellId) : undefined;
    if (op.spellId && !row) continue; // unknown id — fall through to applyLearnSpellOp's not-found error
    if (row && cantripLists !== null && !row.classes.some((c) => cantripLists.includes(c))) {
      throw new InvalidLevelUpError(`${row.name} is not on the ${lowerClass} cantrip list.`);
    }
  }
}

interface NewSpellsGate {
  maxSpellLevel: number;
  spellLists: string[] | null;
  cantripLists: string[] | null;
}

// Reads the served eligibility facts off the newSpells step — the server-BUILT
// plan step, never a client-supplied field (CLAUDE.md: never let a
// client-computed value be trusted by a transaction endpoint), and never
// re-deriving magicalSecretsSpellLists here. Returns null when the level-up has
// no newSpells step (assertNoExcess/assertCantrips already rejected any pick in
// that case, so there's nothing left to gate).
function resolveNewSpellsGate(steps: LevelUpStep[]): NewSpellsGate | null {
  const step = steps.find((s): s is LevelUpStep & { kind: "newSpells" } => s.kind === "newSpells");
  if (!step) return null;
  return {
    maxSpellLevel: typeof step.meta?.maxSpellLevel === "number" ? step.meta.maxSpellLevel : 0,
    spellLists: (step.meta?.spellLists as string[] | null | undefined) ?? null,
    cantripLists: (step.meta?.cantripLists as string[] | null | undefined) ?? null,
  };
}

// Orchestrates the #1440 eligibility gate: read the catalog once, apply the
// pre-existing cantrip/leveled placement check, then gate leveled picks on the
// served ceiling + spellLists and cantrip picks on cantripLists. op.custom picks
// are exempt from the class-list checks (a DM-authored spell has no catalog
// `classes` array) but are still subject to the ceiling.
async function assertPickSpellEligibility(
  submission: LevelUpSubmission,
  steps: LevelUpStep[],
  className: string,
): Promise<void> {
  const cantripOps = submission.cantripsLearned ?? [];
  const spellOps = submission.spellsLearned ?? [];
  const { rowById, levelOf } = await loadPickCatalogRows(cantripOps, spellOps);
  assertCantripVsLeveledPlacement(cantripOps, spellOps, levelOf);

  const gate = resolveNewSpellsGate(steps);
  if (!gate) return;

  const lowerClass = className.toLowerCase();
  assertLeveledSpellEligibility(spellOps, rowById, gate.maxSpellLevel, gate.spellLists);
  assertCantripEligibility(cantripOps, rowById, gate.cantripLists, lowerClass);
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
  const { planCharacter, targetEntry, chosenSubclassName } =
    await resolveLevelUpContext(characterId, submission.target, submission.subclassId);

  const steps = validateLevelUpSubmission(planCharacter, targetEntry, chosenSubclassName, submission);
  await assertPickSpellEligibility(submission, steps, targetEntry.name);

  const ops = buildLevelUpOps(steps, submission);

  await runCharacterTransaction(characterId, ops, {
    select: { id: true },
    notFound: (id) => new InvalidLevelUpError(`Character not found: ${id}`),
    applyOp: ({ tx, op, characterId: id, batchId, sessionId }) =>
      LEVEL_UP_OP_APPLIERS[op.domain](tx, id, op.op, batchId, sessionId, userId).then(() => undefined),
  });
}
