// clearBuffsMatchingInTx is the ONLY way a buff ends; every exported clear* function funnels through it
// so the clear and the suspended-condition restore stay fused, never separable by a caller.
// Mindless Rage's suspended-condition restore — PHB'14 p.49.
import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import {
  normalizeActiveEffectsMutable,
  serializeActiveEffectsState,
  snapshotActiveEffects,
  type ActiveBuff,
} from "./active-effects.js";
import { restoreSuspendedConditionsForBuffEndInTx } from "./conditions.js";

function buffCount(n: number): string {
  return `${n} buff${n !== 1 ? "s" : ""}`;
}

interface BuffClearDescribe {
  summary: (dropped: ActiveBuff[]) => string;
  data: (dropped: ActiveBuff[]) => Record<string, unknown>;
}

// Restores suspended conditions AFTER writing the buff removal, so a condition another still-active buff keeps immune stays suspended.
async function clearBuffsMatchingInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  predicate: (b: ActiveBuff) => boolean,
  describe: BuffClearDescribe,
  batchId: string,
  sessionId: string | null,
): Promise<string[]> {
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: { activeEffects: true },
  });
  if (!row) return [];

  const state = normalizeActiveEffectsMutable(row.activeEffects);
  const dropped = state.buffs.filter(predicate);
  if (dropped.length === 0) return [];
  const before = snapshotActiveEffects(state);
  state.buffs = state.buffs.filter((b) => !predicate(b));

  await tx.character.update({
    where: { id: characterId },
    data: { activeEffects: serializeActiveEffectsState(state) },
  });

  await logEvent(tx, {
    characterId,
    category: "effects",
    type: "buffCleared",
    summary: describe.summary(dropped),
    before,
    after: snapshotActiveEffects(state),
    data: describe.data(dropped),
    batchId,
    sessionId,
  });

  await restoreSuspendedConditionsForBuffEndInTx(tx, characterId, batchId, sessionId);

  return dropped.map((b) => b.key);
}

export async function clearBuffsForSourceInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  sourceEntryId: string,
  batchId: string,
  sessionId: string | null,
  reason: string,
): Promise<string[]> {
  return clearBuffsMatchingInTx(
    tx,
    characterId,
    (b) => b.sourceEntryId === sourceEntryId && b.duration === "concentration",
    {
      summary: (dropped) => `Cleared ${buffCount(dropped.length)} (${reason})`,
      data: (dropped) => ({ sourceEntryId, reason, clearedKeys: dropped.map((b) => b.key) }),
    },
    batchId,
    sessionId,
  );
}

export async function clearBuffByKeyInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  key: string,
  batchId: string,
  sessionId: string | null,
  reason: string,
): Promise<string[]> {
  // Durable-only: concentration buffs end via clearBuffsForSourceInTx instead.
  return clearBuffsMatchingInTx(
    tx,
    characterId,
    (b) => b.key === key && b.duration !== "concentration",
    {
      summary: (dropped) => `Cleared ${dropped[0].source} (${reason})`,
      data: (dropped) => ({ key, reason, clearedKeys: dropped.map((b) => b.key) }),
    },
    batchId,
    sessionId,
  );
}

export async function clearWhileActiveBuffsInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
  reason: string,
): Promise<string[]> {
  return clearBuffsMatchingInTx(
    tx,
    characterId,
    (b) => b.duration === "while-active",
    {
      summary: (dropped) => `Cleared ${buffCount(dropped.length)} (${reason})`,
      data: (dropped) => ({ reason, clearedKeys: dropped.map((b) => b.key) }),
    },
    batchId,
    sessionId,
  );
}

export async function clearBuffsForRestInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  restType: "short" | "long",
  batchId: string,
  sessionId: string | null,
): Promise<string[]> {
  return clearBuffsMatchingInTx(
    tx,
    characterId,
    // A long rest clears both "short" and "long" restType buffs; a short rest clears only "short".
    (b) => b.duration === "until-rest" && (restType === "long" || b.restType === "short"),
    {
      summary: (dropped) => `Cleared ${buffCount(dropped.length)} (${restType} rest)`,
      data: (dropped) => ({ restType, reason: `${restType}Rest`, clearedKeys: dropped.map((b) => b.key) }),
    },
    batchId,
    sessionId,
  );
}
