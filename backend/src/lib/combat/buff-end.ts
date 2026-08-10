/**
 * The ONLY way a buff ends (#1121). Every exported clear* function funnels
 * through clearBuffsMatchingInTx, which — after removing the matched buffs —
 * always restores any suspended condition whose immunity no longer holds
 * (restoreSuspendedConditionsForBuffEndInTx). Keeping the clear + restore
 * fused in one private core is the structural invariant: a caller cannot end
 * a buff and strand a condition 2014 Mindless Rage suspended against it
 * (PHB'14 p.49), no matter which path — voluntary toggle-end, falling
 * unconscious, a rest, dismissing a spell buff, unequipping an item — did the
 * clearing. Lives apart from active-effects.ts because the restore needs
 * deriveImmuneConditions (conditions.ts), which itself reads buff state from
 * active-effects.ts — folding the restore in there would be an import cycle.
 */

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import {
  normalizeActiveEffectsMutable,
  serializeActiveEffectsState,
  snapshotActiveEffects,
  type ActiveBuff,
} from "./active-effects.js";
import { restoreSuspendedConditionsForBuffEndInTx } from "./conditions.js";

// Plural buff count phrase, e.g. "1 buff" / "3 buffs".
function buffCount(n: number): string {
  return `${n} buff${n !== 1 ? "s" : ""}`;
}

// Builds the `buffCleared` event's summary + data from the buffs it dropped.
interface BuffClearDescribe {
  summary: (dropped: ActiveBuff[]) => string;
  data: (dropped: ActiveBuff[]) => Record<string, unknown>;
}

/**
 * Shared core for every clear* wrapper: read → filter by `predicate` → (no-op +
 * no event when nothing matches) → write → log one `buffCleared` event under the
 * "effects" category → restore any suspended condition no longer covered by an
 * immunity (restoreSuspendedConditionsForBuffEndInTx — which re-derives the
 * immune set AFTER this write, so a condition another still-active buff keeps
 * immune stays suspended). `describe` supplies the wrapper-specific summary +
 * data keys so the exact event payload each caller has always written is
 * preserved. Returns the dropped buffs' own `key`s (empty when nothing matched).
 */
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

/**
 * Clear every buff granted by `sourceEntryId` (the concentration that just
 * ended). No-op + no event when none match. Logs a `buffCleared` event under
 * the "effects" category so batch revert restores the dropped buffs. Returns
 * the cleared buffs' own keys (empty when none matched).
 */
export async function clearBuffsForSourceInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  sourceEntryId: string,
  batchId: string,
  sessionId: string | null,
  reason: string,
): Promise<string[]> {
  // Only concentration-duration buffs clear when a concentration ends; durable
  // (while-active / until-rest) buffs survive concentration changes (#455).
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

/**
 * Clear the buff with the given `key` (toggle off a durable self-buff, e.g. end
 * Rage). No-op + no event when none match. Logs a `buffCleared` event under the
 * "effects" category so batch revert restores it. Returns the cleared key
 * wrapped in an array (empty when nothing matched).
 */
export async function clearBuffByKeyInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  key: string,
  batchId: string,
  sessionId: string | null,
  reason: string,
): Promise<string[]> {
  // Durable-only toggle: never clear a concentration buff (those end via
  // clearBuffsForSourceInTx). Dedup-by-key keeps one buff per key today, but the
  // guard makes the "durable only" contract machine-readable if that ever relaxes.
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

/**
 * Clear every "while-active" durable buff (e.g. Rage). Called when a blanket
 * event ends all combat self-buffs — falling unconscious (0 HP) or a long rest.
 * No-op + no event when none match. Logs a `buffCleared` event under "effects".
 * Returns the cleared buffs' own keys (empty when none matched).
 */
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

/**
 * Clear every "until-rest" buff the given rest ends. A long rest clears both
 * "short" and "long" restType buffs; a short rest clears only "short". No-op +
 * no event when none match. Logs a `buffCleared` event under "effects".
 * Returns the cleared buffs' own keys (empty when none matched).
 */
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
    (b) => b.duration === "until-rest" && (restType === "long" || b.restType === "short"),
    {
      summary: (dropped) => `Cleared ${buffCount(dropped.length)} (${restType} rest)`,
      data: (dropped) => ({ restType, reason: `${restType}Rest`, clearedKeys: dropped.map((b) => b.key) }),
    },
    batchId,
    sessionId,
  );
}
