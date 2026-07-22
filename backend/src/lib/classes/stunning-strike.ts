// Stunning Strike (Monk L5, SRD 5.2 / PHB'24 p.88) live-play automation — the
// monk counterpart to applySneakAttackOperations. Once per turn, after hitting
// with an Unarmed Strike or a monk weapon, spend 1 focus to force a
// Constitution save against the monk's focus save DC (8 + prof + Wis): fail →
// Stunned until the start of the monk's next turn; success (2024 rule) → the
// target's speed is halved and the monk's attacks against it have advantage,
// both until the start of the monk's next turn.
//
// Target-rider modeling choice (#1242): this app has no NPC/monster Combatant
// model — Session/SessionParticipant track only the party's own Characters,
// and applyConditionInTx (combat/conditions.ts) only ever mutates the ACTING
// character's own `conditions` column. So unlike a self-condition (e.g. Cloak
// of Shadows' self-invisible), the Stunned/half-speed+advantage rider can't be
// persisted as state on anything — it's narrated only, exactly like a
// save-forcing spell's announce line (frontend spellCast.ts's castAnnounceLine)
// or a Battle Master maneuver's announced DC (maneuvers.ts's ManeuverCastResult).
// The summary string carries the full rider text for the session log + the
// session card; no condition/buff row is written for the target.
//
// Roll ownership: the target's ability scores aren't tracked by this app, so
// the save roll is a flat d20 with no modifier — the DC math is exact (8 +
// prof + Wis), but the roll itself is a deliberate simplification pending an
// NPC stat-block model. The DM may narrate an override if the target's actual
// Constitution save would differ materially.

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { applySpendResourceInTx } from "./resources.js";
import { focusSaveDC } from "./monk.js";

export class InvalidStunningStrikeOperationError extends Error {}

// Once per turn, client-asserted (mirrors Sneak Attack's usedThisTurn — the
// server has no session turn state to cross-check against).
export interface AttemptStunningStrikeOperation {
  type: "attemptStunningStrike";
  usedThisTurn: boolean;
}

export type StunningStrikeOperation = AttemptStunningStrikeOperation;

export type StunningStrikeOutcome = "fail" | "success";

export interface StunningStrikeAttemptResult {
  dc: number;
  roll: number;
  outcome: StunningStrikeOutcome;
  summary: string;
}

/** Once-per-turn guard — pure so the red/green test can exercise it directly. */
export function canAttemptStunningStrike(input: { usedThisTurn: boolean }): boolean {
  return !input.usedThisTurn;
}

/** SRD 5.2 Constitution save: fail (roll < DC) is Stunned; success halves speed + grants advantage. */
export function resolveStunningStrikeOutcome(roll: number, dc: number): StunningStrikeOutcome {
  return roll >= dc ? "success" : "fail";
}

function stunningStrikeSummary(dc: number, roll: number, outcome: StunningStrikeOutcome): string {
  const base = `Stunning Strike — DC ${dc}, target rolled ${roll}`;
  return outcome === "fail"
    ? `${base}: failed the save — Stunned until the start of your next turn.`
    : `${base}: made the save — its speed is halved and your attacks against it have advantage until the start of your next turn.`;
}

const STUNNING_STRIKE_SELECT = {
  experiencePoints: true,
  abilityScores: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, level: true },
  },
} satisfies Prisma.CharacterSelect;

type StunningStrikeRow = Prisma.CharacterGetPayload<{ select: typeof STUNNING_STRIKE_SELECT }>;

// Stunning Strike is a base monk feature granted at monk level 5 (not a
// subclass), so it gates on the monk class entry's own level directly —
// mirrors rogueLevel(row) in sneak-attack.ts.
function monkLevel(row: StunningStrikeRow): number {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk")?.level ?? 0;
}

async function attemptStunningStrike(
  ctx: CharacterTxContext<StunningStrikeRow, AttemptStunningStrikeOperation>,
): Promise<StunningStrikeAttemptResult> {
  const { tx, row, op, characterId, batchId, sessionId } = ctx;

  if (monkLevel(row) < 5) {
    throw new InvalidStunningStrikeOperationError("Only a monk (level 5+) has Stunning Strike");
  }
  if (!canAttemptStunningStrike({ usedThisTurn: op.usedThisTurn })) {
    throw new InvalidStunningStrikeOperationError("Stunning Strike can only be attempted once per turn");
  }

  // Proficiency bonus is a character-total-level function (not monk-level),
  // matching every other DC formula in this codebase (deriveEntryScopedResources).
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const abilityScores = row.abilityScores as Record<string, number>;
  const dc = focusSaveDC(abilityScores, profBonus);

  // Spend 1 focus BEFORE rolling — insufficient focus throws
  // InvalidResourceOperationError (its own 400), so a failed spend never
  // reaches (or narrates) a save attempt.
  await applySpendResourceInTx(tx, characterId, { type: "spendResource", key: "focus" }, batchId, sessionId);

  const roll = 1 + Math.floor(Math.random() * 20);
  const outcome = resolveStunningStrikeOutcome(roll, dc);
  const summary = stunningStrikeSummary(dc, roll, outcome);

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "castStunningStrike",
    summary,
    data: { dc, roll, outcome },
    batchId,
    sessionId,
  });

  return { dc, roll, outcome, summary };
}

/**
 * Applies a batch of Stunning Strike operations atomically. Mirrors
 * applySneakAttackOperations: one batchId, state re-read per op. Returns one
 * result per op (client surfaces the DC/roll/outcome inline, per #1242's
 * target-rider modeling choice — see the module header).
 */
export async function applyStunningStrikeOperations(
  characterId: string,
  operations: StunningStrikeOperation[],
): Promise<StunningStrikeAttemptResult[]> {
  const results: StunningStrikeAttemptResult[] = [];
  await runCharacterTransaction<typeof STUNNING_STRIKE_SELECT, StunningStrikeOperation>(characterId, operations, {
    select: STUNNING_STRIKE_SELECT,
    notFound: (id) => new InvalidStunningStrikeOperationError(`Character not found: ${id}`),
    applyOp: async (ctx) => {
      results.push(await attemptStunningStrike(ctx));
    },
  });
  return results;
}
