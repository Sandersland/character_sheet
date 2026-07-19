// Sneak Attack cast handler — the rogue counterpart to applyManeuverOperations.
// Sneak Attack spends no pool; it rolls the level-derived Nd6 server-side, adds
// it to the rogue's OWN damage (no enemy state), and logs a roll event. The two
// 5e rules — the Nd6 progression and the once-per-turn + eligibility guard —
// live in rogue.ts and are consumed here.

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { canApplySneakAttack, sneakAttackSpec } from "./rogue.js";

export class InvalidSneakAttackOperationError extends Error {}

// Roll Sneak Attack. `eligible` is the player's manual advantage-or-adjacent-ally
// assertion (never auto-detected); `usedThisTurn` is the client-asserted turn
// tracker's guard state — also never server-verified, since the server has no
// session turn state to cross-check against.
export interface RollSneakAttackOperation {
  type: "rollSneakAttack";
  eligible: boolean;
  usedThisTurn: boolean;
}

export type SneakAttackOperation = RollSneakAttackOperation;

export interface SneakAttackRollResult {
  roll: number;
  dice: number;
  faces: number;
  summary: string;
}

const SNEAK_ATTACK_SELECT = {
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, level: true },
  },
} satisfies Prisma.CharacterSelect;

type SneakAttackRow = Prisma.CharacterGetPayload<{ select: typeof SNEAK_ATTACK_SELECT }>;

// Sneak Attack scales with ROGUE class levels, not total character level.
function rogueLevel(row: SneakAttackRow): number {
  return row.classEntries.find((c) => c.name.toLowerCase() === "rogue")?.level ?? 0;
}

async function rollSneakAttack(
  ctx: CharacterTxContext<SneakAttackRow, RollSneakAttackOperation>,
): Promise<SneakAttackRollResult> {
  const { tx, row, op, characterId, batchId, sessionId } = ctx;

  const spec = sneakAttackSpec(rogueLevel(row));
  if (!spec) {
    throw new InvalidSneakAttackOperationError("Only a rogue (level 1+) has Sneak Attack");
  }
  if (!canApplySneakAttack({ eligible: op.eligible, usedThisTurn: op.usedThisTurn })) {
    throw new InvalidSneakAttackOperationError(
      op.usedThisTurn
        ? "Sneak Attack can only be applied once per turn"
        : "Sneak Attack needs advantage on the attack or an ally adjacent to the target",
    );
  }

  // Server owns the roll: Nd6 summed.
  let roll = 0;
  for (let i = 0; i < spec.count; i += 1) roll += 1 + Math.floor(Math.random() * spec.faces);
  const summary = `Sneak Attack — ${spec.count}d${spec.faces}: ${roll}`;

  await logEvent(tx, {
    characterId,
    category: "roll",
    type: "damageRoll",
    summary,
    data: { source: "Sneak Attack", dice: spec.count, faces: spec.faces, roll },
    batchId,
    sessionId,
  });

  return { roll, dice: spec.count, faces: spec.faces, summary };
}

// Applies a batch of Sneak Attack operations atomically. Mirrors
// applyManeuverOperations: one batchId, state re-read per op. Returns one result
// per op (client folds the roll into the attack's damage tally).
export async function applySneakAttackOperations(
  characterId: string,
  operations: SneakAttackOperation[],
): Promise<SneakAttackRollResult[]> {
  const results: SneakAttackRollResult[] = [];
  await runCharacterTransaction<typeof SNEAK_ATTACK_SELECT, SneakAttackOperation>(characterId, operations, {
    select: SNEAK_ATTACK_SELECT,
    notFound: (id) => new InvalidSneakAttackOperationError(`Character not found: ${id}`),
    applyOp: async (ctx) => {
      results.push(await rollSneakAttack(ctx));
    },
  });
  return results;
}
