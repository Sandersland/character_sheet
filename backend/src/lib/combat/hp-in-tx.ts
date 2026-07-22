import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import { characterAdvancementSlots, deriveFeatBonuses } from "@/lib/srd/srd.js";
// Leaf module (no back-imports), NOT classes/resources.ts (#1243) — that file
// now also composes applyHealInTx (Uncanny Metabolism's bonus heal), which
// would close an import cycle back through this one.
import { normalizeResourcesMutable, splitAdvancementsBySlotCap } from "@/lib/classes/resources-state.js";
import {
  InvalidHitPointOperationError,
  normalizeHitPoints,
  normalizeHitDice,
  type HitPoints,
  type HitDice,
} from "./hp-core.js";
import { applyConcentrationCheckInTx, type ConcentrationCheckResult } from "./concentration.js";

/**
 * Applies a single heal op inside a caller-supplied Prisma transaction.
 *
 * Exported so the actions orchestrator (actionsRouter) can compose a
 * "consume potion + heal" pair into one atomic $transaction without opening a
 * nested transaction. Keep the heal logic in sync with the `case "heal"` in
 * dispatchHpOp (hp-transaction.ts).
 */
export async function applyHealInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  amount: number,
  batchId: string,
  sessionId: string | null,
  attribution?: { source?: string },
): Promise<void> {
  if (amount <= 0) {
    throw new InvalidHitPointOperationError("heal amount must be positive");
  }

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      hitPoints: true,
      hitDice: true,
      abilityScores: true,
      experiencePoints: true,
      resources: true,
      // All entries — the feat-slot cap sums entitlement per class level (#1073),
      // not just the primary (position 0).
      classEntries: {
        orderBy: { position: "asc" as const },
        select: { id: true, level: true, name: true, subclass: true },
      },
    },
  });
  if (!row) {
    throw new InvalidHitPointOperationError(`Character not found: ${characterId}`);
  }

  const hp = normalizeHitPoints(row.hitPoints);
  const hd = normalizeHitDice(row.hitDice);

  const advState = normalizeResourcesMutable(row.resources);
  const featSlotCap = characterAdvancementSlots(row.classEntries, levelForExperience(row.experiencePoints));
  // Origin feats are kept regardless of the slot cap (#1130).
  const { kept: inCapAdvancements } = splitAdvancementsBySlotCap(advState.advancements, featSlotCap);
  const featBonus = deriveFeatBonuses(inCapAdvancements, hd.total);
  const effMax = hp.max + featBonus.maxHp;

  const beforeHp = { ...hp };

  // Regaining HP while at 0 wakes the character and clears death saves.
  if (hp.current === 0) {
    hp.deathSaves = { successes: 0, failures: 0 };
  }
  hp.current = Math.min(effMax, hp.current + amount);

  await tx.character.update({
    where: { id: characterId },
    data: { hitPoints: hp as unknown as Prisma.InputJsonValue },
  });

  const source = attribution?.source;
  await logEvent(tx, {
    characterId,
    category: "hitPoints",
    type: "heal",
    summary: source
      ? `${source} healed ${amount} HP (${beforeHp.current} → ${hp.current} HP)`
      : `Healed ${amount} HP (${beforeHp.current} → ${hp.current} HP)`,
    before: { hitPoints: beforeHp, hitDice: { ...hd } },
    after: { hitPoints: { ...hp }, hitDice: { ...hd } },
    data: source ? { amount, source } : { amount },
    batchId,
    sessionId,
  });
}

// Validate + fetch + apply an in-place HP mutation, persisting it; shared by the
// exported in-tx appliers. `amountLabel` shapes the positive-amount error message.
async function mutateHitPointsInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  amount: number,
  amountLabel: string,
  mutate: (hp: HitPoints) => void,
): Promise<{ hp: HitPoints; hd: HitDice; beforeHp: HitPoints }> {
  if (amount <= 0) {
    throw new InvalidHitPointOperationError(`${amountLabel} amount must be positive`);
  }

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: { hitPoints: true, hitDice: true },
  });
  if (!row) {
    throw new InvalidHitPointOperationError(`Character not found: ${characterId}`);
  }

  const hp = normalizeHitPoints(row.hitPoints);
  const hd = normalizeHitDice(row.hitDice);
  const beforeHp = { ...hp };

  mutate(hp);

  await tx.character.update({
    where: { id: characterId },
    data: { hitPoints: hp as unknown as Prisma.InputJsonValue },
  });

  return { hp, hd, beforeHp };
}

/**
 * Apply damage to a character's HP inside an existing transaction, mirroring
 * the `case "damage"` in dispatchHpOp (hp-transaction.ts).
 *
 * Exported so the spellcasting orchestrator (lib/spellcasting/spellcasting.ts) can compose a
 * "cast self-targeted damage spell + take damage" pair into one atomic
 * $transaction without nesting. Keep the damage logic in sync with the
 * `case "damage"` branch in hp-transaction.ts (temp-HP absorption, floor at 0).
 */
export async function applyDamageInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  amount: number,
  batchId: string,
  sessionId: string | null,
): Promise<ConcentrationCheckResult | null> {
  // Temp HP absorbs first, then current. Both floor at 0.
  const { hp, hd, beforeHp } = await mutateHitPointsInTx(tx, characterId, amount, "damage", (hp) => {
    const absorbed = Math.min(hp.temp, amount);
    hp.temp -= absorbed;
    hp.current = Math.max(0, hp.current - (amount - absorbed));
  });

  await logEvent(tx, {
    characterId,
    category: "hitPoints",
    type: "damage",
    summary: `Took ${amount} damage (${beforeHp.current} → ${hp.current} HP)`,
    before: { hitPoints: beforeHp, hitDice: { ...hd } },
    after: { hitPoints: { ...hp }, hitDice: { ...hd } },
    data: { amount },
    batchId,
    sessionId,
  });

  // Resolve concentration on this damage instance (issue #41), mirroring the
  // `case "damage"` in dispatchHpOp (hp-transaction.ts).
  return applyConcentrationCheckInTx(tx, characterId, amount, hp.current, batchId, sessionId);
}

/**
 * Grant self temporary HP inside an existing transaction (Rally maneuver).
 * Mirrors applySetTempOp: 5e temp HP doesn't stack — take the higher value.
 */
export async function applyTempHpInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  amount: number,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const { hp, hd, beforeHp } = await mutateHitPointsInTx(tx, characterId, amount, "temp HP", (hp) => {
    hp.temp = Math.max(hp.temp, amount);
  });

  await logEvent(tx, {
    characterId,
    category: "hitPoints",
    type: "setTemp",
    summary: `Set temporary HP to ${hp.temp}`,
    before: { hitPoints: beforeHp, hitDice: { ...hd } },
    after: { hitPoints: { ...hp }, hitDice: { ...hd } },
    data: { amount },
    batchId,
    sessionId,
  });
}
