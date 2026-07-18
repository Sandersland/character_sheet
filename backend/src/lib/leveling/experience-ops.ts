import { Prisma } from "@/generated/prisma/client.js";
import { levelForExperience } from "./experience.js";
import { logEvent } from "@/lib/activity/events.js";
import { reconcileLevelGatedState } from "./level-reconciliation.js";
import {
  CharacterTxContext,
  runCharacterTransaction,
} from "@/lib/character/character-transaction.js";
import { prisma } from "@/lib/core/prisma.js";
import { fixedAverageForDie, normalizeHitDice, normalizeHitPoints } from "@/lib/combat/hitpoints.js";
import { abilityModifier, hitDieFace } from "@/lib/srd/srd.js";
import { recomputeSummaries } from "@/lib/session/sessions.js";

export class InvalidExperienceOperationError extends Error {}

// ── Operation types ────────────────────────────────────────────────────────

/** Award or deduct XP by a signed delta ("Earned 450 XP from encounter"). */
export interface XpAwardOperation {
  type: "award";
  amount: number; // signed — positive = gain, negative = correction
}

/** Set total XP to an exact value ("Set to 23,000 XP"). */
export interface XpSetOperation {
  type: "set";
  value: number; // must be >= 0
}

export type ExperienceOperation = XpAwardOperation | XpSetOperation;

// ── Auto-reverse helpers ────────────────────────────────────────────────────

/**
 * Rolls back HP/hit-dice/class-entry-level when XP drops the derived level
 * below the number of level-ups already applied (hitDice.total).
 *
 * The reversal is exact when prior `levelUp` CharacterEvent rows carry the
 * `hpGain` field — those events are read newest-first and popped until the
 * applied-level matches the new XP-derived level. Falls back to the fixed
 * average gain (fixedAverageForDie + conMod) for levels with no event record
 * (e.g. characters seeded before the event log existed).
 */
// Compute the post-level-down HP/HD by subtracting each reversed level's HP gain
// (exact from the levelUp event's `hpGain`, else the average-for-die fallback),
// returning the mutated hp/hd plus their before-snapshots and the single-class
// primary entry to repair. Pure — no writes; the caller persists + logs.
function computeLevelDownState(
  character: {
    hitPoints: Prisma.JsonValue;
    hitDice: Prisma.JsonValue;
    abilityScores: Prisma.JsonValue;
    classEntries: { id: string; level: number }[];
  },
  levelUpEvents: { data: Prisma.JsonValue }[],
  levelsToReverse: number,
) {
  const hp = normalizeHitPoints(character.hitPoints);
  const hd = normalizeHitDice(character.hitDice);
  const abilityScores = character.abilityScores as Record<string, number>;
  const conMod = abilityModifier(abilityScores.constitution ?? 10);
  const faces = hitDieFace(hd.die);
  // Only single-class characters get the position-0 self-heal here; multiclass
  // per-entry levels reconcile via reconcileClassEntryLevels (the registry).
  const primaryEntry = character.classEntries.length === 1 ? character.classEntries[0] : undefined;

  const beforeHp = { ...hp };
  const beforeHd = { ...hd };

  for (let i = 0; i < levelsToReverse; i++) {
    const event = levelUpEvents[i];
    const eventData = (event?.data ?? {}) as Record<string, unknown>;
    const hpGain =
      typeof eventData.hpGain === "number"
        ? eventData.hpGain
        : Math.max(1, fixedAverageForDie(faces) + conMod); // best-effort fallback

    hp.max = Math.max(1, hp.max - hpGain);
    hp.current = Math.min(hp.current, hp.max);
    hd.total = Math.max(0, hd.total - 1);
    hd.spent = Math.min(hd.spent, hd.total);
  }

  return { hp, hd, beforeHp, beforeHd, primaryEntry };
}

async function revertLevelUps(
  tx: Prisma.TransactionClient,
  characterId: string,
  currentHdTotal: number,
  targetLevel: number,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const levelsToReverse = currentHdTotal - targetLevel;
  if (levelsToReverse <= 0) return;

  // Fetch the most recent levelUp events newest-first (up to levelsToReverse)
  // to get exact per-level HP gains when available.
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
      classEntries: { orderBy: { position: "asc" as const }, select: { id: true, level: true } },
    },
  });
  if (!character) throw new InvalidExperienceOperationError(`Character not found: ${characterId}`);

  const { hp, hd, beforeHp, beforeHd, primaryEntry } = computeLevelDownState(
    character,
    levelUpEvents,
    levelsToReverse,
  );

  // Repair the position-0 class entry's level to match the new hd.total.
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

// ── Op helpers ──────────────────────────────────────────────────────────────

/**
 * Resolves the target XP total + event type for one op. Award applies a signed
 * delta clamped at 0; set takes an exact non-negative value (rejects negatives).
 */
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

/** The undoable timeline summary for one XP event. */
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
  Prisma.CharacterGetPayload<{ select: { experiencePoints: true; hitDice: true } }>,
  ExperienceOperation
>;

/**
 * Applies one XP op inside the batch transaction: persist the new total, log the
 * undoable event, auto-reverse HP/hit-dice if the derived level dropped below the
 * applied level, then reconcile all level-gated state. State is re-read per op so
 * a multi-op batch sees each prior result.
 */
async function applyExperienceOp(ctx: XpTxContext): Promise<void> {
  const { tx, row, op, characterId, batchId, sessionId } = ctx;
  const prevXp = row.experiencePoints;
  const hd = normalizeHitDice(row.hitDice);
  const { newXp, eventType } = resolveXpChange(op, prevXp);

  // Apply the XP change first.
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

  // Auto-reverse HP if the new XP drops derived level below applied level.
  // This fixes the stranded-HP bug: lowering XP now rolls HP/hit-dice back.
  const newDerivedLevel = levelForExperience(newXp);
  if (newDerivedLevel < hd.total) {
    await revertLevelUps(tx, characterId, hd.total, newDerivedLevel, batchId, sessionId);
  }

  // Reconcile all level-gated state (subclass choice, maneuvers known, …) in the
  // registered order. Runs unconditionally so it catches characters who gained a
  // subclass via XP alone (no HP level-ups applied yet) and self-heals those
  // already in an invalid state on their next XP op.
  await reconcileLevelGatedState({ tx, characterId, newDerivedLevel, batchId });
}

// ── Main handler ────────────────────────────────────────────────────────────

/**
 * Applies a batch of XP operations atomically. Each op writes a
 * `CharacterEvent` (category: "experience"). If the resulting XP drops the
 * derived level below the number of HP level-ups already applied
 * (hitDice.total), auto-reverses those HP gains in the same transaction —
 * fixing the stranded-HP bug described in the plan.
 *
 * `explicitSessionId` (optional) tags the resulting events to a SPECIFIC
 * session instead of the currently-active one. This powers the retroactive
 * "add XP to a past (ended) session" flow: when supplied, the targeted
 * session's stored `Session.summary` is recomputed + re-persisted in the same
 * transaction so its `xpGained` reflects the new award immediately. The session
 * must belong to the character (validated before any mutation).
 */
export async function applyExperienceOperations(
  characterId: string,
  operations: ExperienceOperation[],
  explicitSessionId?: string,
): Promise<void> {
  // Domain guard: an explicit session must belong to the character. Runs before
  // the transaction so a non-participant throws with no mutation.
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

  await runCharacterTransaction<{ experiencePoints: true; hitDice: true }, ExperienceOperation>(
    characterId,
    operations,
    {
      select: { experiencePoints: true, hitDice: true },
      notFound: (id) => new InvalidExperienceOperationError(`Character not found: ${id}`),
      // undefined → scaffold falls back to the active session; string → tag verbatim.
      sessionId: explicitSessionId,
      applyOp: applyExperienceOp,
      // Retroactive path: recompute + re-persist the targeted (ended) session's
      // stored summary so its xpGained reflects the award. Mirrors endSession's
      // compute-and-persist (sessions.ts); skipped for the active-session path.
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
