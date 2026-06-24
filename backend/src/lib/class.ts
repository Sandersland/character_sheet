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

import { randomUUID } from "node:crypto";

import { levelForExperience } from "./experience.js";
import { logEvent } from "./events.js";
import { prisma } from "./prisma.js";
import { getActiveSessionId } from "./sessions.js";
import {
  fightingStyleChoiceCount,
  isKnownFightingStyle,
  FIGHTING_STYLES,
  type FightingStyleKey,
} from "./srd.js";
import {
  normalizeResourcesMutable,
  serializeResourcesState,
  type ManeuverEntry,
  type ToolProfEntry,
  type AdvancementEntry,
} from "./resources.js";

// ── Error class ───────────────────────────────────────────────────────────────

export class InvalidClassOperationError extends Error {}

// ── Operation types ───────────────────────────────────────────────────────────

/** Set the character's subclass by catalog id. */
export interface SetSubclassOperation {
  type: "setSubclass";
  subclassId: string;
}

/** Choose the character's Fighting Style (Fighter L1 feature). */
export interface SetFightingStyleOperation {
  type: "setFightingStyle";
  key: FightingStyleKey;
}

export type ClassOperation = SetSubclassOperation | SetFightingStyleOperation;

// ── Transaction handler ───────────────────────────────────────────────────────

export async function applyClassOperations(
  characterId: string,
  operations: ClassOperation[]
): Promise<void> {
  const batchId = randomUUID();
  const sessionId = await getActiveSessionId(characterId);

  await prisma.$transaction(async (tx) => {
    for (const op of operations) {
      switch (op.type) {
        case "setSubclass": {
          // Re-read to get current state.
          const character = await tx.character.findUnique({
            where: { id: characterId },
            select: {
              experiencePoints: true,
              classEntries: {
                orderBy: { position: "asc" as const },
                take: 1,
                select: { id: true, name: true, subclass: true, subclassId: true, classId: true },
              },
            },
          });
          if (!character) {
            throw new InvalidClassOperationError(`Character not found: ${characterId}`);
          }

          const primaryEntry = character.classEntries[0];
          if (!primaryEntry) {
            throw new InvalidClassOperationError("Character has no class entry");
          }

          // Look up the requested subclass.
          const subclass = await tx.subclass.findUnique({
            where: { id: op.subclassId },
            include: { class: { select: { id: true, name: true, subclassLevel: true } } },
          });
          if (!subclass) {
            throw new InvalidClassOperationError(
              `Subclass not found: ${op.subclassId}`
            );
          }

          // Validate subclass belongs to the character's primary class.
          if (subclass.classId !== primaryEntry.classId) {
            throw new InvalidClassOperationError(
              `Subclass "${subclass.name}" belongs to ${subclass.class.name}, not the character's class`
            );
          }

          // Validate character level meets the subclass-granting level.
          const level = levelForExperience(character.experiencePoints);
          const required = subclass.class.subclassLevel;
          if (level < required) {
            throw new InvalidClassOperationError(
              `Character is level ${level} but ${subclass.class.name} grants a subclass at level ${required}`
            );
          }

          const beforeData = {
            subclassId: primaryEntry.subclassId ?? null,
            subclass: primaryEntry.subclass ?? null,
          };

          // Write subclassId + drifting name to the class entry.
          await tx.characterClassEntry.update({
            where: { id: primaryEntry.id },
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
            data: { classEntryId: primaryEntry.id, subclassId: subclass.id, subclassName: subclass.name },
            batchId,
            sessionId,
          });
          break;
        }

        case "setFightingStyle": {
          // Re-read per-op so a batch sees each previous op's result.
          const character = await tx.character.findUnique({
            where: { id: characterId },
            select: {
              experiencePoints: true,
              resources: true,
              classEntries: {
                orderBy: { position: "asc" as const },
                take: 1,
                select: { name: true },
              },
            },
          });
          if (!character) {
            throw new InvalidClassOperationError(`Character not found: ${characterId}`);
          }

          // Validate the requested key is a known fighting style.
          if (!isKnownFightingStyle(op.key)) {
            throw new InvalidClassOperationError(`Unknown fighting style: ${op.key}`);
          }

          // Validate the character is entitled to a fighting style at this level.
          const className = character.classEntries[0]?.name ?? "";
          const level = levelForExperience(character.experiencePoints);
          if (fightingStyleChoiceCount(className, level) === 0) {
            throw new InvalidClassOperationError(
              `Character (${className || "no class"}, level ${level}) cannot choose a Fighting Style`,
            );
          }

          const state = normalizeResourcesMutable(character.resources);
          // Deep-copy the full resources state for before/after snapshots so the
          // `resources` undo branch in activity.ts restores everything wholesale.
          const snapshot = (s: typeof state) => ({
            resources: {
              used: { ...s.used },
              maneuversKnown: s.maneuversKnown.map((m: ManeuverEntry) => ({ ...m })),
              toolProficienciesKnown: s.toolProficienciesKnown.map((t: ToolProfEntry) => ({ ...t })),
              advancements: s.advancements.map((a: AdvancementEntry) => ({
                ...a,
                abilityDeltas: { ...a.abilityDeltas },
              })),
              fightingStyle: s.fightingStyle,
            },
          });

          const beforeFs = snapshot(state);
          state.fightingStyle = op.key;
          await tx.character.update({
            where: { id: characterId },
            data: { resources: serializeResourcesState(state) },
          });
          const afterFs = snapshot(state);

          const styleLabel =
            FIGHTING_STYLES.find((s) => s.key === op.key)?.label ?? op.key;

          await logEvent(tx, {
            characterId,
            // `resources` category so the existing resources revert branch in
            // routes/activity.ts restores before.resources (incl. fightingStyle)
            // with zero new undo code.
            category: "resources",
            type: "fightingStyleChosen",
            summary: `Chose fighting style: ${styleLabel}`,
            before: beforeFs,
            after: afterFs,
            data: { fightingStyle: op.key },
            batchId,
            sessionId,
          });
          break;
        }
      }
    }
  });
}
