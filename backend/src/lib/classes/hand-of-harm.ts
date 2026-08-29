// Hand of Harm, PHB'24 p.92 — not in SRD 5.2 (gap-fill content, #1248).
// No target/condition model: the necrotic bonus and Poisoned rider are narrated only. The client rolls the Martial Arts die + Wis mod total; the server only validates positivity (mirrors Quivering Palm's 10d12).

import type { DealHandOfHarmOperation, HandOfHarmOperation } from "@character-sheet/contracts";

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { applySpendResourceInTx } from "./resources.js";
import { resolveSubclassSlug } from "./subclass-slug.js";

export class InvalidHandOfHarmOperationError extends Error {}

export interface HandOfHarmResult {
  necroticDamage: number;
  poisoned: boolean;
  summary: string;
}

export function canDealHandOfHarm(input: { usedThisTurn: boolean }): boolean {
  return !input.usedThisTurn;
}

function handOfHarmSummary(necroticDamage: number, poisoned: boolean): string {
  const base = `Hand of Harm — ${necroticDamage} necrotic damage`;
  return poisoned ? `${base}; Physician's Touch: Poisoned until the end of your next turn.` : `${base}.`;
}

const HAND_OF_HARM_SELECT = {
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, level: true, subclass: true, subclassRef: { select: { slug: true } } },
  },
} satisfies Prisma.CharacterSelect;

type HandOfHarmRow = Prisma.CharacterGetPayload<{ select: typeof HAND_OF_HARM_SELECT }>;

function monkEntry(row: HandOfHarmRow) {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk");
}

// Resolved via slug (FK preferred, exact normalized name as fallback) — mirrors Open Hand Technique's isWarriorOfTheOpenHand and Quivering Palm's own copy.
function isWarriorOfMercy(row: HandOfHarmRow): boolean {
  const monk = monkEntry(row);
  return !!monk && resolveSubclassSlug("monk", monk) === "monk-warrior-of-mercy";
}

function assertDealHandOfHarmValid(row: HandOfHarmRow, op: DealHandOfHarmOperation) {
  const monk = monkEntry(row);
  if (!monk || monk.level < 3 || !isWarriorOfMercy(row)) {
    throw new InvalidHandOfHarmOperationError("Only a Warrior of Mercy monk (level 3+) has Hand of Harm");
  }
  if (!canDealHandOfHarm({ usedThisTurn: op.usedThisTurn })) {
    throw new InvalidHandOfHarmOperationError("Hand of Harm can only be dealt once per turn");
  }
  if (!Number.isFinite(op.roll) || op.roll <= 0) {
    throw new InvalidHandOfHarmOperationError("dealHandOfHarm requires a positive necrotic damage roll");
  }
  if (op.freeFromFlurry && monk.level < 11) {
    throw new InvalidHandOfHarmOperationError("Flurry of Healing and Harm requires a level 11+ Warrior of Mercy");
  }
  return monk;
}

async function dealHandOfHarm(
  ctx: CharacterTxContext<HandOfHarmRow, DealHandOfHarmOperation>,
): Promise<HandOfHarmResult> {
  const { row, op, characterId, tx, batchId, sessionId } = ctx;
  const monk = assertDealHandOfHarmValid(row, op);

  const spendKey = op.freeFromFlurry ? "flurryOfHealingAndHarm" : "focus";
  await applySpendResourceInTx(tx, characterId, { type: "spendResource", key: spendKey }, batchId, sessionId);

  const poisoned = monk.level >= 6; // Physician's Touch (L6)
  const summary = handOfHarmSummary(op.roll, poisoned);

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "dealHandOfHarm",
    summary,
    data: { necroticDamage: op.roll, poisoned, freeFromFlurry: op.freeFromFlurry ?? false },
    batchId,
    sessionId,
  });

  return { necroticDamage: op.roll, poisoned, summary };
}

// Mirrors applyStunningStrikeOperations: one batchId, state re-read per op.
export async function applyHandOfHarmOperations(
  characterId: string,
  operations: HandOfHarmOperation[],
): Promise<HandOfHarmResult[]> {
  const results: HandOfHarmResult[] = [];
  await runCharacterTransaction<typeof HAND_OF_HARM_SELECT, HandOfHarmOperation>(characterId, operations, {
    select: HAND_OF_HARM_SELECT,
    notFound: (id) => new InvalidHandOfHarmOperationError(`Character not found: ${id}`),
    applyOp: async (opCtx) => {
      results.push(await dealHandOfHarm(opCtx));
    },
  });
  return results;
}
