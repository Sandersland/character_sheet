// Hand of Ultimate Mercy, PHB'24 p.92 — not in SRD 5.2 (gap-fill content, #1248).
// No target/HP/condition model: everything about the revived creature is narrated only. The client rolls 4d10 + Wisdom modifier and sends the total; the server only validates positivity.

import type { HandOfUltimateMercyOperation, UseHandOfUltimateMercyOperation } from "@character-sheet/contracts";

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { applySpendResourceInTx } from "./resources.js";
import { resolveSubclassSlug } from "./subclass-slug.js";

export class InvalidHandOfUltimateMercyOperationError extends Error {}

export interface HandOfUltimateMercyResult {
  hpRestored: number;
  summary: string;
}

const HAND_OF_ULTIMATE_MERCY_SELECT = {
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, level: true, subclass: true, subclassRef: { select: { slug: true } } },
  },
} satisfies Prisma.CharacterSelect;

type HandOfUltimateMercyRow = Prisma.CharacterGetPayload<{ select: typeof HAND_OF_ULTIMATE_MERCY_SELECT }>;

function monkEntry(row: HandOfUltimateMercyRow) {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk");
}

// Resolved via slug (FK preferred, exact normalized name as fallback) — same pattern as Hand of Harm's own isWarriorOfMercy copy.
function isWarriorOfMercy(row: HandOfUltimateMercyRow): boolean {
  const monk = monkEntry(row);
  return !!monk && resolveSubclassSlug("monk", monk) === "monk-warrior-of-mercy";
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

  // Spend the 1/long-rest pool before the 5-Focus cost so an already-used Hand of Ultimate Mercy fails fast without touching Focus — both spends share this transaction, so either failure rolls back both.
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

// Mirrors applyQuiveringPalmOperations: one batchId, state re-read per op.
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
