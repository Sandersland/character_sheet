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
import { draconicResilienceMaxHpTerm } from "./draconic-bloodline.js";
import {
  abilityModifier,
  characterFightingStyleFeatSlots,
  deriveFeatBonuses,
  hitDieFace,
  multiclassPrerequisitesMet,
  type MulticlassPrerequisiteOption,
} from "@/lib/srd/srd.js";

export class InvalidClassOperationError extends Error {}

export interface SetSubclassOperation {
  type: "setSubclass";
  subclassId: string;
}

export interface AddClassOperation {
  type: "addClass";
  classId: string;
  method?: "average" | "roll";
  roll?: number;
}

export type ClassOperation =
  | SetSubclassOperation
  | AddClassOperation;

interface ClassOpContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  batchId: string;
  sessionId: string | null;
}

// Each class appears at most once per character (uniqueness enforced by applyAddClass) — so resolving the entry by subclass.classId alone is unambiguous.
async function applySetSubclass(ctx: ClassOpContext, op: SetSubclassOperation): Promise<void> {
  const { tx, characterId, batchId, sessionId } = ctx;

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

  // Hoisted so both the guard below and the subclass-gate check resolve the SAME edition — never call editionOf twice for one op.
  const edition = editionOf(character);

  const subclass = await tx.subclass.findUnique({
    where: { id: op.subclassId },
    include: { class: { select: { id: true, name: true, subclassLevel: true } } },
  });
  if (!subclass) {
    throw new InvalidClassOperationError(`Subclass not found: ${op.subclassId}`);
  }

  // Runs before the class-membership check: a wrong-edition row is treated as not in this character's catalog at all, mirroring resolveEditionRow (#1345).
  const mismatch = crossEditionRejection(subclass, `Subclass "${subclass.name}"`, edition);
  if (mismatch) throw new InvalidClassOperationError(mismatch);

  const entry = character.classEntries.find((e) => e.classId === subclass.classId);
  if (!entry) {
    throw new InvalidClassOperationError(
      `Subclass "${subclass.name}" belongs to ${subclass.class.name}, not one of the character's classes`
    );
  }

  const level = effectiveEntryLevel(
    entry.level,
    character.classEntries.length,
    levelForExperience(character.experiencePoints),
  );
  // Same gate the reconciler and the clamp-on-read use — without it the write path could accept a subclass the sheet then refuses to show (#1285).
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

// Adding a class entry bumps hitDice.total by 1 in the same op — the entry count and hitDice.total stay coupled.
const ADD_CLASS_SELECT = {
  experiencePoints: true,
  abilityScores: true,
  hitPoints: true,
  hitDice: true,
  // resources/conditions/rulesEdition are effectiveMaxHitPoints' inputs (exhaustion 4+ can push current above effective max after a flat HP gain); class.extraAsiLevels/fightingStyleFeatLevel mirror buildHpOpContext's own select — keep in sync.
  resources: true,
  conditions: true,
  rulesEdition: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    // subclass/subclassRef.slug/class.subclassLevel are draconicResilienceMaxHpTerm's identity inputs for the clamp below.
    select: {
      id: true,
      name: true,
      level: true,
      position: true,
      classId: true,
      subclass: true,
      subclassRef: { select: { slug: true } },
      // class.name is the canonical name characterFightingStyleFeatSlots'/resolveSubclassSlug needs — same rationale as #1495's own class.name select.
      class: { select: { name: true, extraAsiLevels: true, fightingStyleFeatLevel: true, subclassLevel: true } },
    },
  },
} satisfies Prisma.CharacterSelect;

type AddClassCharacter = Prisma.CharacterGetPayload<{ select: typeof ADD_CLASS_SELECT }>;

function assertRollInRange(op: AddClassOperation, faces: number, hitDie: string): void {
  if (op.method === "roll" && (op.roll === undefined || op.roll < 1 || op.roll > faces)) {
    throw new InvalidClassOperationError(`Roll must be between 1 and ${faces} for a ${hitDie}`);
  }
}

async function resolveMulticlass(
  tx: Prisma.TransactionClient,
  character: AddClassCharacter,
  op: AddClassOperation,
): Promise<{ catalog: { id: string; name: string; hitDie: string }; faces: number; gain: number }> {
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

  if (character.classEntries.some((e) => e.classId === catalog.id)) {
    throw new InvalidClassOperationError(`Character already has levels in ${catalog.name}`);
  }

  // PHB'14 p.163 — multiclass ability prerequisite, same validator as level-up.
  const abilityScores = character.abilityScores as Record<string, number>;
  const prereq = multiclassPrerequisitesMet(
    catalog.multiclassPrerequisites as MulticlassPrerequisiteOption[] | null,
    abilityScores,
  );
  if (!prereq.met) {
    throw new InvalidClassOperationError(`Cannot multiclass into ${catalog.name}: requires ${prereq.description}`);
  }

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
  // At exhaustion 4+, raising raw max by `gain` doesn't raise effective max by the same amount — clamp current to the recomputed effective max rather than gaining the full `gain` (mirrors bumpHpForLevelUp).
  const derivedLevel = levelForExperience(character.experiencePoints);
  const fightingStyleSlotTotal = characterFightingStyleFeatSlots(character.classEntries, derivedLevel, character.rulesEdition);
  const inCapAdvancements = inCapAdvancementsAt(character.resources, character.classEntries, derivedLevel, fightingStyleSlotTotal);
  // Must use the POST-op class-entry list (new entry appended), not pre-op — else effectiveEntryLevel reads the XP-derived total level instead of the sorcerer's own (now lower) level, overstating the Draconic term.
  const entriesAfterAdd = [
    ...character.classEntries,
    { name: catalog.name, level: 1, subclass: null, subclassRef: null, class: null },
  ];
  const maxHpBonus =
    deriveFeatBonuses(inCapAdvancements, beforeHd.total + 1).maxHp +
    draconicResilienceMaxHpTerm(entriesAfterAdd, derivedLevel, character.rulesEdition);
  const exhaustionLevel = normalizeConditionsMutable(character.conditions).exhaustion;
  const newEffMax = effectiveMaxHitPoints(newMax, maxHpBonus, exhaustionLevel, character.rulesEdition);
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

// Runs inside a caller-supplied tx/batchId so the unified level-up endpoint can compose it with other domains.
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
  // The scaffold's own select is only the existence check — each applier re-reads with its own domain select (ClassOpContext), so it composes under a caller-supplied tx too (setSubclassInTx).
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
