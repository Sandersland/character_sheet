// Composition seam for the unified level-up endpoint (#885): resolves the target
// class entry, validates a structured submission against its derived plan
// (validateLevelUpSubmission), maps the validated steps to tagged domain ops, and
// applies them all under ONE batchId in ONE runCharacterTransaction. No 5e rules
// live here — every rule is delegated to the validator/plan and the *InTx seams.
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import {
  applyAdvancementOpInTx,
  type AdvancementOperation,
} from "@/lib/leveling/advancement.js";
import {
  setSubclassInTx,
  setFightingStyleInTx,
  type SetSubclassOperation,
  type SetFightingStyleOperation,
} from "@/lib/classes/class.js";
import type { FightingStyleKey } from "@/lib/srd/fighting-styles.js";
import { applyResourceOpInTx, type ResourceOperation } from "@/lib/classes/resources.js";
import { applySpellcastingOpInTx, type SpellcastingOperation } from "@/lib/spellcasting/spellcasting.js";
import {
  applyLevelUpHpInTx,
  normalizeHitDice,
} from "@/lib/combat/hitpoints.js";
import type { LevelUpOperation } from "@/lib/combat/hp-operations.js";
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

// A validated step, mapped to the seam that applies it. Each domain re-reads its
// own state via `tx`, so a later op sees the earlier op's write (e.g. the maneuver
// steps see the subclass the earlier `class` op set on the primary entry).
type LevelUpTxOp =
  | { domain: "hp"; op: LevelUpOperation }
  | { domain: "advancement"; op: AdvancementOperation }
  | { domain: "class"; op: SetSubclassOperation | SetFightingStyleOperation }
  | { domain: "resources"; op: ResourceOperation }
  | { domain: "spellcasting"; op: SpellcastingOperation };

// Everything resolveLevelUpContext hands to validation + op-building.
interface LevelUpContext {
  planCharacter: LevelUpPlanCharacter;
  targetEntry: TargetClassEntry;
  chosenSubclassName: string | null;
  // applyResourceOpInTx derives choice caps from the position-0 entry only, so
  // resource-backed steps are only legal when the target IS the primary entry
  // (the subclass/fightingStyle seams are entry-aware since #1065).
  targetIsPrimary: boolean;
}

const TARGET_ENTRY_SELECT = {
  id: true,
  name: true,
  subclass: true,
  level: true,
  position: true,
  classId: true,
} satisfies Prisma.CharacterClassEntrySelect;

// Fetch the target class's catalog subclassLevel; default 3 (mirrors reconcileSubclass
// / subclassStep) when the class row or column is absent.
async function subclassLevelFor(classId: string | null, className: string): Promise<number> {
  const row = classId
    ? await prisma.characterClass.findUnique({ where: { id: classId }, select: { subclassLevel: true } })
    : await prisma.characterClass.findFirst({
        where: { name: { equals: className, mode: "insensitive" } },
        select: { subclassLevel: true },
      });
  return row?.subclassLevel ?? 3;
}

// Reads the character + resolves submission.target into the validator inputs. The
// per-entry `level` column can lag hitDice.total for a single-class character, so
// a single-class existing target derives newLevel from hitDice.total (precedent:
// the prepared-cap re-read in applySpellcastingOpInTx).
async function resolveLevelUpContext(characterId: string, submission: LevelUpSubmission): Promise<LevelUpContext> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: {
      abilityScores: true,
      hitDice: true,
      classEntries: { orderBy: { position: "asc" }, select: TARGET_ENTRY_SELECT },
    },
  });
  if (!character) throw new InvalidLevelUpError(`Character not found: ${characterId}`);

  const isMulticlass = character.classEntries.length > 1;
  let targetClassName: string;
  let persistedSubclass: string | null;
  let newLevel: number;
  let classId: string | null;
  let targetIsPrimary: boolean;

  const target = submission.target;
  if (target.kind === "existing") {
    const entry = character.classEntries.find((e) => e.id === target.classEntryId);
    if (!entry) throw new InvalidLevelUpError(`Class entry not found: ${target.classEntryId}`);
    targetClassName = entry.name;
    persistedSubclass = entry.subclass;
    newLevel = isMulticlass ? entry.level + 1 : normalizeHitDice(character.hitDice).total + 1;
    classId = entry.classId;
    targetIsPrimary = entry.position === 0;
  } else {
    const catalog = await prisma.characterClass.findUnique({
      where: { id: target.classId },
      select: { name: true },
    });
    if (!catalog) throw new InvalidLevelUpError(`Class not found: ${target.classId}`);
    targetClassName = catalog.name;
    persistedSubclass = null;
    newLevel = 1;
    classId = target.classId;
    targetIsPrimary = false; // a new multiclass entry is never the primary
  }

  const subclassLevel = await subclassLevelFor(classId, targetClassName);

  let chosenSubclassName: string | null = null;
  if (submission.subclassId) {
    // applySetSubclass re-validates subclass-belongs-to-class in-tx; here we only
    // resolve id → name for the pure validator (one copy of the membership rule).
    const sub = await prisma.subclass.findUnique({ where: { id: submission.subclassId }, select: { name: true } });
    if (!sub) throw new InvalidLevelUpError(`Subclass not found: ${submission.subclassId}`);
    chosenSubclassName = sub.name;
  }

  return {
    planCharacter: {
      abilityScores: character.abilityScores as Record<string, number>,
      classEntries: character.classEntries.map((e) => ({ name: e.name, subclass: e.subclass, level: e.level })),
    },
    targetEntry: { name: targetClassName, subclass: persistedSubclass, newLevel, subclassLevel },
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
  fightingStyle: (s) => [{ domain: "class", op: { type: "setFightingStyle", key: s.fightingStyle as FightingStyleKey } }],
  maneuvers: (s) => (s.maneuvers ?? []).map((op) => ({ domain: "resources", op })),
  disciplines: (s) => (s.disciplines ?? []).map((op) => ({ domain: "resources", op })),
  toolProficiency: (s) => (s.toolProficiencies ?? []).map((op) => ({ domain: "resources", op })),
  subclassChoice: (s, step) =>
    (s.subclassChoices ?? [])
      .filter((c) => c.choiceKey === step.meta?.key)
      .map((op) => ({ domain: "resources", op })),
  newSpells: (s) => (s.spellsLearned ?? []).map((op) => ({ domain: "spellcasting", op })),
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
  class: (tx, id, op, batchId, sessionId) => {
    const classOp = op as SetSubclassOperation | SetFightingStyleOperation;
    return classOp.type === "setSubclass"
      ? setSubclassInTx(tx, id, classOp, batchId, sessionId)
      : setFightingStyleInTx(tx, id, classOp, batchId, sessionId);
  },
  resources: (tx, id, op, batchId, sessionId) => applyResourceOpInTx(tx, id, op as ResourceOperation, batchId, sessionId),
  spellcasting: (tx, id, op, batchId, sessionId, userId) =>
    applySpellcastingOpInTx(tx, id, op as SpellcastingOperation, batchId, sessionId, userId),
};

/**
 * Validate `submission` against the character's derived level-up plan and apply
 * every resulting choice (hit points, advancement, subclass, subclass-derived
 * choices, new spells) atomically under one batchId. Throws InvalidLevelUpError
 * for any resolution/validation failure; each seam throws its own domain error on
 * an invalid op, rolling back the whole batch.
 */
export async function applyLevelUpTransaction(
  characterId: string,
  submission: LevelUpSubmission,
  userId: string,
): Promise<void> {
  const { planCharacter, targetEntry, chosenSubclassName, targetIsPrimary } =
    await resolveLevelUpContext(characterId, submission);

  const steps = validateLevelUpSubmission(planCharacter, targetEntry, chosenSubclassName, submission);

  // The resources seam derives choice caps (and the read-clamp derives its view)
  // from the primary entry only — a non-primary pick would be written uncapped
  // and then hidden on read, so reject it up front until that seam is entry-aware.
  const RESOURCE_BACKED: ReadonlySet<LevelUpStepKind> = new Set([
    "maneuvers", "disciplines", "toolProficiency", "subclassChoice",
  ]);
  if (!targetIsPrimary && steps.some((s) => RESOURCE_BACKED.has(s.kind))) {
    throw new InvalidLevelUpError(
      "Subclass features that grant maneuvers, disciplines, or other picks are not supported for a non-primary class yet",
    );
  }

  const ops = buildLevelUpOps(steps, submission);

  await runCharacterTransaction(characterId, ops, {
    select: { id: true },
    notFound: (id) => new InvalidLevelUpError(`Character not found: ${id}`),
    applyOp: ({ tx, op, characterId: id, batchId, sessionId }) =>
      LEVEL_UP_OP_APPLIERS[op.domain](tx, id, op.op, batchId, sessionId, userId).then(() => undefined),
  });
}
