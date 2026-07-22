// Hand of Harm (Warrior of Mercy L3, PHB'24 p.92 — not in SRD 5.2, gap-fill
// content, #1248) — a rider on an Unarmed Strike hit, mirroring Stunning
// Strike's once-per-turn shape but with NO save (per the subclass's header
// note: none of its features call for one). Once per turn, after hitting
// with an Unarmed Strike and dealing damage, expend 1 Focus (or, at L11+, a
// free use from Flurry of Healing and Harm) to deal extra Necrotic damage
// equal to one Martial Arts die + Wisdom modifier. Physician's Touch (L6)
// adds the Poisoned condition until the end of the monk's next turn.
//
// Target-rider modeling + roll ownership (mirrors Quivering Palm / Stunning
// Strike): this app tracks no NPC/monster combatant, so the necrotic bonus
// and the Poisoned rider are narrated only — no HP/condition column exists
// for the target. The bonus is the monk's own supernatural effect, so the
// client rolls the Martial Arts die + Wis mod total and sends it; the server
// only validates positivity and narrates it, same as Quivering Palm's 10d12.

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { applySpendResourceInTx } from "./resources.js";

export class InvalidHandOfHarmOperationError extends Error {}

// Once per turn, client-asserted (mirrors AttemptStunningStrikeOperation — no
// server-side turn state exists to cross-check).
export interface DealHandOfHarmOperation {
  type: "dealHandOfHarm";
  usedThisTurn: boolean;
  /** Client-rolled Martial Arts die + Wisdom modifier total (necrotic damage). */
  roll: number;
  /**
   * Flurry of Healing and Harm (L11, PHB'24 p.92): spend a free use from that
   * pool instead of the base Focus pool. Still requires a level 11+ Warrior
   * of Mercy; the once-per-turn limit above still applies.
   */
  freeFromFlurry?: boolean;
}

export type HandOfHarmOperation = DealHandOfHarmOperation;

export interface HandOfHarmResult {
  necroticDamage: number;
  poisoned: boolean;
  summary: string;
}

/** Once-per-turn guard — pure so the red/green test can exercise it directly. */
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
    select: { name: true, level: true, subclass: true },
  },
} satisfies Prisma.CharacterSelect;

type HandOfHarmRow = Prisma.CharacterGetPayload<{ select: typeof HAND_OF_HARM_SELECT }>;

function monkEntry(row: HandOfHarmRow) {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk");
}

// Substring-matched against the freeform subclass string, like Open Hand
// Technique's isWarriorOfTheOpenHand / Quivering Palm's own copy.
function isWarriorOfMercy(row: HandOfHarmRow): boolean {
  return (monkEntry(row)?.subclass ?? "").toLowerCase().includes("mercy");
}

// Every guard for one dealHandOfHarm op, pulled out of the handler so its own
// branching stays under the complexity gate. Throws on the first violation;
// returns the monk entry (level is needed below for Physician's Touch).
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

/**
 * Applies a batch of Hand of Harm operations atomically. Mirrors
 * applyStunningStrikeOperations: one batchId, state re-read per op.
 */
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
