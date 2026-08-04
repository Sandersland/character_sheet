/**
 * Class transaction handler — post-creation subclass selection and future
 * class-related mutations (rename, multiclass additions).
 *
 * Today ships one op: `setSubclass` — the common case of choosing a subclass
 * when a character reaches the class's subclass-granting level (e.g. Fighter
 * at level 3 choosing Battle Master). This endpoint fills the gap that
 * PATCH /api/characters/:id doesn't cover (it's cosmetic field-patch only)
 * and that character creation doesn't cover (characters start at level 1,
 * before most classes grant their subclass).
 */

import { Prisma } from "@/generated/prisma/client.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import { effectiveEntryLevel, subclassGateLevel } from "@/lib/leveling/effective-levels.js";
import { editionOf } from "@/lib/rules/edition.js";
import { crossEditionRejection } from "@/lib/rules/catalog-edition.js";
import { logEvent } from "@/lib/activity/events.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import {
  effectiveMaxHitPoints,
  inCapAdvancementsAt,
  levelUpHpGain,
  normalizeHitDice,
  normalizeHitPoints,
} from "@/lib/combat/hitpoints.js";
import { normalizeConditionsMutable } from "@/lib/combat/conditions.js";
import {
  abilityModifier,
  characterFightingStyleFeatSlots,
  deriveFeatBonuses,
  hitDieFace,
  multiclassPrerequisitesMet,
  type MulticlassPrerequisiteOption,
} from "@/lib/srd/srd.js";

export class InvalidClassOperationError extends Error {}

/** Set the character's subclass by catalog id. */
export interface SetSubclassOperation {
  type: "setSubclass";
  subclassId: string;
}

/** Multiclass into a new class by catalog id — creates a level-1 entry. */
export interface AddClassOperation {
  type: "addClass";
  classId: string;
  method?: "average" | "roll";
  roll?: number;
}

export type ClassOperation =
  | SetSubclassOperation
  | AddClassOperation;

// Transaction handler. Per-op context: the transaction client plus the batch/session ids stable
// across the whole batch. Each helper re-reads the character with its own select.
interface ClassOpContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  batchId: string;
  sessionId: string | null;
}

// setSubclass: choose a subclass once the owning class entry reaches its
// subclass-granting level; drifts subclassId + name onto that entry. The target
// entry is resolved BY the subclass's class (#1065) — each class appears at most
// once among a character's entries (applyAddClass enforces uniqueness), so the
// subclass id alone is unambiguous.
async function applySetSubclass(ctx: ClassOpContext, op: SetSubclassOperation): Promise<void> {
  const { tx, characterId, batchId, sessionId } = ctx;

  // Re-read to get current state.
  const character = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      experiencePoints: true,
      rulesEdition: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        select: { id: true, name: true, subclass: true, subclassId: true, classId: true, level: true },
      },
    },
  });
  if (!character) {
    throw new InvalidClassOperationError(`Character not found: ${characterId}`);
  }
  if (character.classEntries.length === 0) {
    throw new InvalidClassOperationError("Character has no class entry");
  }

  // Hoisted above the subclass lookup so both the guard below and the
  // subclass-gate check further down resolve the SAME edition (never call
  // editionOf twice for one op).
  const edition = editionOf(character);

  // Look up the requested subclass.
  const subclass = await tx.subclass.findUnique({
    where: { id: op.subclassId },
    include: { class: { select: { id: true, name: true, subclassLevel: true } } },
  });
  if (!subclass) {
    throw new InvalidClassOperationError(`Subclass not found: ${op.subclassId}`);
  }

  // Before class-membership: a wrong-edition row is "not in this character's
  // catalog at all", the same treatment resolveEditionRow gives it (#1345).
  const mismatch = crossEditionRejection(subclass, `Subclass "${subclass.name}"`, edition);
  if (mismatch) throw new InvalidClassOperationError(mismatch);

  // Validate the character has levels in the subclass's class.
  const entry = character.classEntries.find((e) => e.classId === subclass.classId);
  if (!entry) {
    throw new InvalidClassOperationError(
      `Subclass "${subclass.name}" belongs to ${subclass.class.name}, not one of the character's classes`
    );
  }

  // Validate the entry's class level meets the subclass-granting level.
  const level = effectiveEntryLevel(
    entry.level,
    character.classEntries.length,
    levelForExperience(character.experiencePoints),
  );
  // Same gate the reconciler and the clamp-on-read use — without this the write
  // path would accept a subclass the sheet then refuses to show (#1285).
  const required = subclassGateLevel(subclass.class.subclassLevel, edition);
  if (level < required) {
    throw new InvalidClassOperationError(
      `Character is ${subclass.class.name} level ${level} but the subclass is not granted until level ${required}`
    );
  }

  const beforeData = {
    subclassId: entry.subclassId ?? null,
    subclass: entry.subclass ?? null,
  };

  // Write subclassId + drifting name to the class entry.
  await tx.characterClassEntry.update({
    where: { id: entry.id },
    data: {
      subclassId: subclass.id,
      subclass: subclass.name,
    },
  });

  const afterData = {
    subclassId: subclass.id,
    subclass: subclass.name,
  };

  await logEvent(tx, {
    characterId,
    category: "class",
    type: "subclassChosen",
    summary: `Chose subclass: ${subclass.name} (${subclass.class.name})`,
    before: { ...beforeData },
    after: { ...afterData },
    data: { classEntryId: entry.id, subclassId: subclass.id, subclassName: subclass.name },
    batchId,
    sessionId,
  });
}

// addClass: multiclass into a new class by spending a pending level-up — creates
// a level-1 entry and rolls its HP so the entry stays coupled to hitDice.total.
// Columns/relations re-read for an addClass op.
const ADD_CLASS_SELECT = {
  experiencePoints: true,
  abilityScores: true,
  hitPoints: true,
  hitDice: true,
  // resources/conditions/rulesEdition (#1321): effectiveMaxHitPoints' inputs —
  // a multiclass level-up bumps hp.max+current by the SAME gain, which at
  // exhaustion 4+ can push current above the (proportionally smaller-growing)
  // effective max. `class.extraAsiLevels`/`fightingStyleFeatLevel` mirror
  // buildHpOpContext's own select.
  resources: true,
  conditions: true,
  rulesEdition: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { id: true, name: true, level: true, position: true, classId: true, class: { select: { extraAsiLevels: true, fightingStyleFeatLevel: true } } },
  },
} satisfies Prisma.CharacterSelect;

type AddClassCharacter = Prisma.CharacterGetPayload<{ select: typeof ADD_CLASS_SELECT }>;

// An explicit roll must be a legal face of the new class's hit die.
function assertRollInRange(op: AddClassOperation, faces: number, hitDie: string): void {
  if (op.method === "roll" && (op.roll === undefined || op.roll < 1 || op.roll > faces)) {
    throw new InvalidClassOperationError(`Roll must be between 1 and ${faces} for a ${hitDie}`);
  }
}

// Validate the multiclass request (pending level-up, unique class, PHB prereqs,
// roll bounds) and return the target class + rolled HP gain.
async function resolveMulticlass(
  tx: Prisma.TransactionClient,
  character: AddClassCharacter,
  op: AddClassOperation,
): Promise<{ catalog: { id: string; name: string; hitDie: string }; faces: number; gain: number }> {
  // Adding a class spends a pending level-up: a new entry bumps hitDice.total by 1.
  const derivedLevel = levelForExperience(character.experiencePoints);
  const appliedLevels = normalizeHitDice(character.hitDice).total;
  if (appliedLevels >= derivedLevel) {
    throw new InvalidClassOperationError("No pending level-up: earn a level before adding a class");
  }

  const catalog = await tx.characterClass.findUnique({
    where: { id: op.classId },
    select: { id: true, name: true, hitDie: true, multiclassPrerequisites: true },
  });
  if (!catalog) {
    throw new InvalidClassOperationError(`Class not found: ${op.classId}`);
  }

  // A class can only be taken once — extra levels go through the HP level-up.
  if (character.classEntries.some((e) => e.classId === catalog.id)) {
    throw new InvalidClassOperationError(`Character already has levels in ${catalog.name}`);
  }

  // 5e multiclass ability prerequisite (PHB'14 p. 163) — same validator as level-up.
  // `multiclassPrerequisites` (#1529): the catalog row's own Json column, cast
  // once like every other opaque-Json Prisma field this codebase reads.
  const abilityScores = character.abilityScores as Record<string, number>;
  const prereq = multiclassPrerequisitesMet(
    catalog.multiclassPrerequisites as MulticlassPrerequisiteOption[] | null,
    abilityScores,
  );
  if (!prereq.met) {
    throw new InvalidClassOperationError(`Cannot multiclass into ${catalog.name}: requires ${prereq.description}`);
  }

  // Roll HP so the class-entry level stays coupled to hitDice.total.
  const faces = hitDieFace(catalog.hitDie);
  assertRollInRange(op, faces, catalog.hitDie);
  const conMod = abilityModifier(abilityScores.constitution ?? 10);
  const gain = levelUpHpGain(faces, conMod, op.method ?? "average", op.roll);
  return { catalog, faces, gain };
}

async function applyAddClass(ctx: ClassOpContext, op: AddClassOperation): Promise<void> {
  const { tx, characterId, batchId, sessionId } = ctx;

  // Re-read per-op so a batch sees each previous op's result.
  const character = await tx.character.findUnique({
    where: { id: characterId },
    select: ADD_CLASS_SELECT,
  });
  if (!character) {
    throw new InvalidClassOperationError(`Character not found: ${characterId}`);
  }

  const { catalog, faces, gain } = await resolveMulticlass(tx, character, op);

  const beforeHp = normalizeHitPoints(character.hitPoints);
  const beforeHd = normalizeHitDice(character.hitDice);
  const newMax = beforeHp.max + gain;
  // #1321: at exhaustion 4+, raising the raw max by `gain` doesn't raise the
  // effective max by the same amount — clamp current to the recomputed
  // effective max rather than gain the full `gain` unconditionally (mirrors
  // bumpHpForLevelUp's own reasoning, hp-ops.ts).
  const derivedLevel = levelForExperience(character.experiencePoints);
  const fightingStyleSlotTotal = characterFightingStyleFeatSlots(character.classEntries, derivedLevel);
  const inCapAdvancements = inCapAdvancementsAt(character.resources, character.classEntries, derivedLevel, fightingStyleSlotTotal);
  const featMaxHpBonus = deriveFeatBonuses(inCapAdvancements, beforeHd.total + 1).maxHp;
  const exhaustionLevel = normalizeConditionsMutable(character.conditions).exhaustion;
  const newEffMax = effectiveMaxHitPoints(newMax, featMaxHpBonus, exhaustionLevel, character.rulesEdition);
  const afterHp = {
    ...beforeHp,
    max: newMax,
    current: Math.min(beforeHp.current + gain, newEffMax),
  };
  const afterHd = { ...beforeHd, total: beforeHd.total + 1 };

  const position =
    character.classEntries.reduce((max, e) => Math.max(max, e.position), -1) + 1;

  const beforeEntries = character.classEntries.map((e) => ({ ...e }));
  const created = await tx.characterClassEntry.create({
    data: { characterId, classId: catalog.id, name: catalog.name, level: 1, position },
  });

  await tx.character.update({
    where: { id: characterId },
    data: { hitPoints: afterHp, hitDice: afterHd },
  });

  await logEvent(tx, {
    characterId,
    category: "class",
    type: "classAdded",
    summary: `Multiclassed into ${catalog.name} (level 1, +${gain} HP)`,
    before: { classEntries: beforeEntries, hitPoints: beforeHp, hitDice: beforeHd },
    after: {
      classEntries: [...beforeEntries, { ...created }],
      hitPoints: afterHp,
      hitDice: afterHd,
    },
    data: { createdClassEntryId: created.id, classId: catalog.id, hpGain: gain, faces },
    batchId,
    sessionId,
  });
}

// Applies one setSubclass inside a caller-supplied tx/batchId so the unified
// level-up endpoint (#885) can compose it with other domains (#895).
export async function setSubclassInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: SetSubclassOperation,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  await applySetSubclass({ tx, characterId, batchId, sessionId }, op);
}

export async function applyClassOperations(
  characterId: string,
  operations: ClassOperation[]
): Promise<void> {
  // The scaffold's per-op row is only the existence check: each applier
  // re-reads with its own domain select (see ClassOpContext) so it can also be
  // composed under a caller-supplied tx (setSubclassInTx).
  await runCharacterTransaction(characterId, operations, {
    select: { id: true },
    notFound: (id) => new InvalidClassOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, op, characterId: id, batchId, sessionId }) => {
      const ctx: ClassOpContext = { tx, characterId: id, batchId, sessionId };
      switch (op.type) {
        case "setSubclass":
          await applySetSubclass(ctx, op);
          break;
        case "addClass":
          await applyAddClass(ctx, op);
          break;
      }
    },
  });
}
