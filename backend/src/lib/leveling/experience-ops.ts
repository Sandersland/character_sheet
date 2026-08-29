import type { ExperienceOperation } from "@character-sheet/contracts";
import type { RulesEdition } from "@character-sheet/shared-types";

import { Prisma } from "@/generated/prisma/client.js";
import { levelForExperience } from "./experience.js";
import { levelDownEntryLevels } from "./effective-levels.js";
import { logEvent } from "@/lib/activity/events.js";
import { reconcileLevelGatedState } from "./level-reconciliation.js";
import {
  CharacterTxContext,
  runCharacterTransaction,
} from "@/lib/character/character-transaction.js";
import { prisma } from "@/lib/core/prisma.js";
import { editionOf } from "@/lib/rules/edition.js";
import {
  effectiveMaxHitPoints,
  fixedAverageForDie,
  inCapAdvancementsAt,
  normalizeHitDice,
  normalizeHitPoints,
} from "@/lib/combat/hitpoints.js";
import { normalizeConditionsMutable } from "@/lib/combat/conditions.js";
import { draconicResilienceMaxHpTerm } from "@/lib/classes/draconic-bloodline.js";
import { abilityModifier, characterFightingStyleFeatSlots, deriveFeatBonuses, hitDieFace } from "@/lib/srd/srd.js";
import { recomputeSummaries } from "@/lib/session/sessions.js";

export class InvalidExperienceOperationError extends Error {}

function computeLevelDownState(
  character: {
    hitPoints: Prisma.JsonValue;
    hitDice: Prisma.JsonValue;
    abilityScores: Prisma.JsonValue;
    resources: Prisma.JsonValue;
    conditions: Prisma.JsonValue;
    classEntries: {
      id: string;
      level: number;
      name: string;
      subclass: string | null;
      subclassRef: { slug: string } | null;
      // `name` (#1148): characterFightingStyleFeatSlots' resolveSubclassSlug input — the canonical class name (#1495).
      class: { name: string; extraAsiLevels: number[]; fightingStyleFeatLevel: number | null; subclassLevel: number } | null;
    }[];
  },
  levelUpEvents: { data: Prisma.JsonValue }[],
  levelsToReverse: number,
  // #1321: the post-reversal advancement-slot cap and exhaustion's halving are both evaluated at the character's FINAL (post-reversal) state.
  targetLevel: number,
  edition: RulesEdition,
) {
  const hp = normalizeHitPoints(character.hitPoints);
  const hd = normalizeHitDice(character.hitDice);
  const abilityScores = character.abilityScores as Record<string, number>;
  const conMod = abilityModifier(abilityScores.constitution ?? 10);
  const faces = hitDieFace(hd.die);
  // Only single-class characters get the position-0 self-heal here; multiclass per-entry levels reconcile via reconcileClassEntryLevels (the registry).
  const primaryEntry = character.classEntries.length === 1 ? character.classEntries[0] : undefined;

  const beforeHp = { ...hp };
  const beforeHd = { ...hd };

  // #1321: current clamps to the EFFECTIVE (exhaustion-halved) max, evaluated once at the FINAL (post-reversal) advancement-slot cap.
  const fightingStyleSlotTotal = characterFightingStyleFeatSlots(character.classEntries, targetLevel, edition);
  const inCapAdvancements = inCapAdvancementsAt(character.resources, character.classEntries, targetLevel, fightingStyleSlotTotal);
  const exhaustionLevel = normalizeConditionsMutable(character.conditions).exhaustion;
  // #1123: runs BEFORE the reconciler chain, so classEntries still hold PRE-level-down levels — projected via levelDownEntryLevels (the same allocation reconcileClassEntryLevels persists next) so the Draconic Resilience term doesn't read stale levels.
  const projectedLevels = levelDownEntryLevels(character.classEntries.map((e) => e.level), targetLevel);
  const projectedEntries = character.classEntries
    .map((entry, i) => ({ ...entry, level: projectedLevels[i] }))
    .filter((entry) => entry.level > 0);
  const subclassMaxHpBonus = draconicResilienceMaxHpTerm(projectedEntries, targetLevel, edition);

  for (let i = 0; i < levelsToReverse; i++) {
    const event = levelUpEvents[i];
    const eventData = (event?.data ?? {}) as Record<string, unknown>;
    const hpGain =
      typeof eventData.hpGain === "number"
        ? eventData.hpGain
        : Math.max(1, fixedAverageForDie(faces) + conMod);

    hp.max = Math.max(1, hp.max - hpGain);
    hd.total = Math.max(0, hd.total - 1);
    const maxHpBonus = deriveFeatBonuses(inCapAdvancements, hd.total).maxHp + subclassMaxHpBonus;
    hp.current = Math.min(hp.current, effectiveMaxHitPoints(hp.max, maxHpBonus, exhaustionLevel, edition));
    hd.spent = Math.min(hd.spent, hd.total);
  }

  return { hp, hd, beforeHp, beforeHd, primaryEntry };
}

async function revertLevelUps(
  tx: Prisma.TransactionClient,
  characterId: string,
  currentHdTotal: number,
  targetLevel: number,
  edition: RulesEdition,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const levelsToReverse = currentHdTotal - targetLevel;
  if (levelsToReverse <= 0) return;

  const levelUpEvents = await tx.characterEvent.findMany({
    where: { characterId, type: "levelUp", reverted: false },
    orderBy: { createdAt: "desc" },
    take: levelsToReverse,
  });

  const character = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      hitPoints: true,
      hitDice: true,
      abilityScores: true,
      // resources/conditions (#1321): effectiveMaxHitPoints' inputs. fightingStyleFeatLevel: characterFightingStyleFeatSlots' fs-cap arg.
      resources: true,
      conditions: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        // name/subclass/subclassRef.slug/class.subclassLevel (#1123): draconicResilienceMaxHpTerm's identity inputs.
        select: {
          id: true,
          level: true,
          name: true,
          subclass: true,
          subclassRef: { select: { slug: true } },
          // `name` (#1148): characterFightingStyleFeatSlots' resolveSubclassSlug input — the canonical class name (#1495).
          class: { select: { name: true, extraAsiLevels: true, fightingStyleFeatLevel: true, subclassLevel: true } },
        },
      },
    },
  });
  if (!character) throw new InvalidExperienceOperationError(`Character not found: ${characterId}`);

  const { hp, hd, beforeHp, beforeHd, primaryEntry } = computeLevelDownState(
    character,
    levelUpEvents,
    levelsToReverse,
    targetLevel,
    edition,
  );

  if (primaryEntry && primaryEntry.level !== hd.total) {
    await tx.characterClassEntry.update({
      where: { id: primaryEntry.id },
      data: { level: hd.total },
    });
  }

  await tx.character.update({
    where: { id: characterId },
    data: {
      hitPoints: hp as unknown as Prisma.InputJsonValue,
      hitDice: hd as unknown as Prisma.InputJsonValue,
    },
  });

  await logEvent(tx, {
    characterId,
    category: "hitPoints",
    type: "levelDown",
    summary: `Leveled down to ${hd.total} — HP adjusted`,
    before: { hitPoints: beforeHp, hitDice: beforeHd, classEntryLevel: beforeHd.total },
    after: { hitPoints: { ...hp }, hitDice: { ...hd }, classEntryLevel: hd.total },
    data: { levelsReversed: levelsToReverse, newLevel: hd.total, primaryEntryId: primaryEntry?.id },
    batchId,
    sessionId,
  });
}

export function resolveXpChange(
  op: ExperienceOperation,
  prevXp: number,
): { newXp: number; eventType: "xpAward" | "xpSet" } {
  if (op.type === "award") {
    return { newXp: Math.max(0, prevXp + op.amount), eventType: "xpAward" };
  }
  if (op.value < 0) {
    throw new InvalidExperienceOperationError("XP value must be non-negative");
  }
  return { newXp: op.value, eventType: "xpSet" };
}

export function xpEventSummary(
  eventType: "xpAward" | "xpSet",
  prevXp: number,
  newXp: number,
): string {
  if (eventType === "xpSet") {
    return `XP set to ${newXp.toLocaleString()} (was ${prevXp.toLocaleString()})`;
  }
  const delta = newXp - prevXp;
  return delta >= 0
    ? `Awarded ${delta.toLocaleString()} XP (${prevXp.toLocaleString()} → ${newXp.toLocaleString()})`
    : `Deducted ${Math.abs(delta).toLocaleString()} XP (${prevXp.toLocaleString()} → ${newXp.toLocaleString()})`;
}

type XpTxContext = CharacterTxContext<
  Prisma.CharacterGetPayload<{ select: { experiencePoints: true; hitDice: true; rulesEdition: true } }>,
  ExperienceOperation
>;

// State is re-read per op so a multi-op batch sees each prior result.
async function applyExperienceOp(ctx: XpTxContext): Promise<void> {
  const { tx, row, op, characterId, batchId, sessionId } = ctx;
  const prevXp = row.experiencePoints;
  const hd = normalizeHitDice(row.hitDice);
  const { newXp, eventType } = resolveXpChange(op, prevXp);

  await tx.character.update({
    where: { id: characterId },
    data: { experiencePoints: newXp },
  });

  await logEvent(tx, {
    characterId,
    category: "experience",
    type: eventType,
    summary: xpEventSummary(eventType, prevXp, newXp),
    before: { experiencePoints: prevXp },
    after: { experiencePoints: newXp },
    data: op.type === "award" ? { amount: op.amount } : { value: op.value },
    batchId,
    sessionId,
  });

  const newDerivedLevel = levelForExperience(newXp);
  if (newDerivedLevel < hd.total) {
    await revertLevelUps(tx, characterId, hd.total, newDerivedLevel, editionOf(row), batchId, sessionId);
  }

  // Runs unconditionally so a subclass gained via XP alone (no HP level-up yet) is caught, and any character already in an invalid state self-heals.
  await reconcileLevelGatedState({ tx, characterId, newDerivedLevel, edition: editionOf(row), batchId });
}

export async function applyExperienceOperations(
  characterId: string,
  operations: ExperienceOperation[],
  explicitSessionId?: string,
): Promise<void> {
  // An explicit session must belong to the character; checked before the transaction so a non-participant throws with no mutation.
  if (explicitSessionId) {
    const participant = await prisma.sessionParticipant.findUnique({
      where: { sessionId_characterId: { sessionId: explicitSessionId, characterId } },
      select: { id: true },
    });
    if (!participant) {
      throw new InvalidExperienceOperationError(
        `Character ${characterId} is not a participant of session ${explicitSessionId}`,
      );
    }
  }

  await runCharacterTransaction<{ experiencePoints: true; hitDice: true; rulesEdition: true }, ExperienceOperation>(
    characterId,
    operations,
    {
      select: { experiencePoints: true, hitDice: true, rulesEdition: true },
      notFound: (id) => new InvalidExperienceOperationError(`Character not found: ${id}`),
      // undefined → scaffold falls back to the active session; string → tag verbatim.
      sessionId: explicitSessionId,
      applyOp: applyExperienceOp,
      // Retroactive path: recomputes + re-persists the targeted (ended) session's stored summary so xpGained reflects the award immediately. Mirrors endSession's compute-and-persist (sessions.ts).
      afterOps: explicitSessionId
        ? async ({ tx }) => {
            const session = await tx.session.findUnique({
              where: { id: explicitSessionId },
              include: {
                participants: { include: { character: { select: { id: true, name: true } } } },
              },
            });
            if (session) await recomputeSummaries(tx, session);
          }
        : undefined,
    },
  );
}
