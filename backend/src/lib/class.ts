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

// ── Error class ───────────────────────────────────────────────────────────────

export class InvalidClassOperationError extends Error {}

// ── Operation types ───────────────────────────────────────────────────────────

/** Set the character's subclass by catalog id. */
export interface SetSubclassOperation {
  type: "setSubclass";
  subclassId: string;
}

export type ClassOperation = SetSubclassOperation;

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
      }
    }
  });
}
