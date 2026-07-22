// Hand of Ultimate Mercy (Warrior of Mercy L17, PHB'24 p.92 — not in SRD 5.2,
// gap-fill content, #1248). Magic action: expend 5 Focus + 1 use of the
// dedicated handOfUltimateMercy pool (its own long-rest gate) to touch a
// creature that died no more than 24 hours ago and return it to life with
// 4d10 + Wisdom modifier hit points, ending Blinded/Deafened/Paralyzed/
// Poisoned/Stunned.
//
// Target-rider modeling (mirrors Quivering Palm / Stunning Strike): this app
// tracks no NPC/monster combatant, and a revival's target is by definition
// not the acting character, so the HP restored + conditions ended are
// narrated only — no HP/condition column is written for anyone. The "dead
// no more than 24 hours" clause is DM-adjudicated narrative, like Quivering
// Palm's day-count duration.
//
// Roll ownership: 4d10 + Wisdom modifier is the monk's own supernatural
// effect, so — like Quivering Palm's 10d12 and Second Wind's 1d10 — the
// client rolls it and sends the total; the server only validates positivity.

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { applySpendResourceInTx } from "./resources.js";

export class InvalidHandOfUltimateMercyOperationError extends Error {}

export interface UseHandOfUltimateMercyOperation {
  type: "useHandOfUltimateMercy";
  /** Client-rolled 4d10 + Wisdom modifier total (hit points restored). */
  roll: number;
}

export type HandOfUltimateMercyOperation = UseHandOfUltimateMercyOperation;

export interface HandOfUltimateMercyResult {
  hpRestored: number;
  summary: string;
}

const HAND_OF_ULTIMATE_MERCY_SELECT = {
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, level: true, subclass: true },
  },
} satisfies Prisma.CharacterSelect;

type HandOfUltimateMercyRow = Prisma.CharacterGetPayload<{ select: typeof HAND_OF_ULTIMATE_MERCY_SELECT }>;

function monkEntry(row: HandOfUltimateMercyRow) {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk");
}

function isWarriorOfMercy(row: HandOfUltimateMercyRow): boolean {
  return (monkEntry(row)?.subclass ?? "").toLowerCase().includes("mercy");
}

async function useHandOfUltimateMercy(
  ctx: CharacterTxContext<HandOfUltimateMercyRow, UseHandOfUltimateMercyOperation>,
): Promise<HandOfUltimateMercyResult> {
  const { row, op, characterId, tx, batchId, sessionId } = ctx;
  const monk = monkEntry(row);

  if (!monk || monk.level < 17 || !isWarriorOfMercy(row)) {
    throw new InvalidHandOfUltimateMercyOperationError(
      "Only a Warrior of Mercy monk (level 17+) has Hand of Ultimate Mercy",
    );
  }
  if (!Number.isFinite(op.roll) || op.roll <= 0) {
    throw new InvalidHandOfUltimateMercyOperationError("useHandOfUltimateMercy requires a positive hit point roll");
  }

  // Spend the dedicated 1/long-rest pool before the 5-Focus cost, so an
  // already-used Hand of Ultimate Mercy this rest fails fast without touching
  // Focus (both spends share this transaction, so either failure rolls back both).
  await applySpendResourceInTx(
    tx, characterId, { type: "spendResource", key: "handOfUltimateMercy" }, batchId, sessionId
  );
  await applySpendResourceInTx(
    tx, characterId, { type: "spendResource", key: "focus", amount: 5 }, batchId, sessionId
  );

  const summary =
    `Hand of Ultimate Mercy — returns the creature to life with ${op.roll} hit points, ` +
    "ending Blinded, Deafened, Paralyzed, Poisoned, and Stunned.";

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "useHandOfUltimateMercy",
    summary,
    data: { hpRestored: op.roll },
    batchId,
    sessionId,
  });

  return { hpRestored: op.roll, summary };
}

/**
 * Applies a batch of Hand of Ultimate Mercy operations atomically. Mirrors
 * applyQuiveringPalmOperations: one batchId, state re-read per op.
 */
export async function applyHandOfUltimateMercyOperations(
  characterId: string,
  operations: HandOfUltimateMercyOperation[],
): Promise<HandOfUltimateMercyResult[]> {
  const results: HandOfUltimateMercyResult[] = [];
  await runCharacterTransaction<typeof HAND_OF_ULTIMATE_MERCY_SELECT, HandOfUltimateMercyOperation>(
    characterId,
    operations,
    {
      select: HAND_OF_ULTIMATE_MERCY_SELECT,
      notFound: (id) => new InvalidHandOfUltimateMercyOperationError(`Character not found: ${id}`),
      applyOp: async (opCtx) => {
        results.push(await useHandOfUltimateMercy(opCtx));
      },
    },
  );
  return results;
}
