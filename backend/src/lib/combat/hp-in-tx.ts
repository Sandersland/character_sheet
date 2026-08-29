import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { InvalidHitPointOperationError, normalizeHitPoints, normalizeHitDice, type HitPoints, type HitDice } from "./hp-core.js";
import { effectiveMaxHitPointsForRow } from "./conditions.js";
import { applyConcentrationCheckInTx, type ConcentrationCheckResult } from "./concentration.js";

// Exported so actionsRouter can compose "consume potion + heal" into one atomic $transaction. Keep in
// sync with dispatchHpOp's case "heal".
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
      // effectiveMaxHitPoints' exhaustion inputs; buildHpOpContext already selects both.
      conditions: true,
      rulesEdition: true,
      // All entries: the feat-slot cap sums entitlement per class level, not just the primary.
      // The heal cap must include the Draconic Resilience term or a Draconic sorcerer's top HP is
      // unreachable by healing.
      classEntries: {
        orderBy: { position: "asc" as const },
        select: {
          id: true,
          level: true,
          name: true,
          subclass: true,
          subclassRef: { select: { slug: true } },
          class: { select: { name: true, extraAsiLevels: true, fightingStyleFeatLevel: true, subclassLevel: true } },
        },
      },
    },
  });
  if (!row) {
    throw new InvalidHitPointOperationError(`Character not found: ${characterId}`);
  }

  const { hp, hd, effMax } = effectiveMaxHitPointsForRow(row);

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

// Exported so the spellcasting orchestrator can compose "cast self-targeted damage spell + take
// damage" into one atomic $transaction. Keep in sync with dispatchHpOp's case "damage" (temp-HP
// absorption, floor at 0).
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

  // Mirrors dispatchHpOp's case "damage" concentration check.
  return applyConcentrationCheckInTx(tx, characterId, amount, hp.current, batchId, sessionId);
}

// Mirrors applySetTempOp: 5e temp HP doesn't stack — take the higher value.
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
