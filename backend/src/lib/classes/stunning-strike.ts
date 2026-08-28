// Stunning Strike (Monk L5). SRD 5.2 / PHB'24 p.88 (2024): once per turn,
// after hitting with an Unarmed Strike or a monk weapon, spend 1 focus to
// force a Constitution save against the monk's focus save DC (8 + prof +
// Wis): fail -> Stunned until the start of the monk's next turn; success ->
// the target's speed is halved until the start of the monk's next turn, and
// the next attack roll against it before then has advantage. SRD 5.1 /
// PHB'14 p.77 (2014): NO once-per-turn cap (any melee weapon attack hit can
// attempt one, as long as ki remains), spends 1 ki, and NO success rider at
// all — a made save simply does nothing further; a failed save is Stunned
// until the END of the monk's next turn (not the start).
//
// This app has no NPC/monster combatant model, so unlike a self-condition
// the Stunned/half-speed+advantage rider can't be persisted as state on
// anything — it's narrated only, exactly like a save-forcing spell's
// announce line. The target's ability scores aren't tracked either, so the
// save roll is a flat d20 with no modifier — the DC math is exact, but the
// roll itself is a deliberate simplification pending an NPC stat-block model.

import type { RulesEdition } from "@character-sheet/shared-types";
import type { AttemptStunningStrikeOperation, StunningStrikeOperation } from "@character-sheet/contracts";

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { editionOf } from "@/lib/rules/edition.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { applySpendResourceInTx } from "./resources.js";
import { monkSaveDC, monkPoolKey } from "./ki-focus.js";

export class InvalidStunningStrikeOperationError extends Error {}

// SRD 5.1 / PHB'14 p.77; SRD 5.2 / PHB'24 p.88 — edition-invariant grant level.
export const STUNNING_STRIKE_LEVEL = 5;

/** Whether a monk (identified by its own class-entry level, never `character.level`) has Stunning Strike. */
export function hasStunningStrike(monkLevel: number): boolean {
  return monkLevel >= STUNNING_STRIKE_LEVEL;
}

export type StunningStrikeOutcome = "fail" | "success";

export interface StunningStrikeAttemptResult {
  dc: number;
  roll: number;
  outcome: StunningStrikeOutcome;
  summary: string;
}

/** 2014 (SRD 5.1 / PHB'14 p.77) has no once-per-turn cap — any melee hit can attempt one, gated only by ki remaining (enforced by the spend below). */
export function canAttemptStunningStrike(input: { usedThisTurn: boolean }, edition: RulesEdition): boolean {
  return edition === "EDITION_2014" ? true : !input.usedThisTurn;
}

/** Constitution save (both editions): fail (roll < DC) is Stunned. 2024 success halves speed + grants advantage; 2014 has no success rider. */
export function resolveStunningStrikeOutcome(roll: number, dc: number): StunningStrikeOutcome {
  return roll >= dc ? "success" : "fail";
}

export function stunningStrikeSummary(dc: number, roll: number, outcome: StunningStrikeOutcome, edition: RulesEdition): string {
  const base = `Stunning Strike — DC ${dc}, target rolled ${roll}`;
  if (edition === "EDITION_2014") {
    return outcome === "fail"
      ? `${base}: failed the save — Stunned until the end of your next turn.`
      : `${base}: made the save — no effect.`;
  }
  return outcome === "fail"
    ? `${base}: failed the save — Stunned until the start of your next turn.`
    : `${base}: made the save — its speed is halved until the start of your next turn, and the next attack roll against it before then has advantage.`;
}

const STUNNING_STRIKE_SELECT = {
  experiencePoints: true,
  abilityScores: true,
  rulesEdition: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, level: true },
  },
} satisfies Prisma.CharacterSelect;

type StunningStrikeRow = Prisma.CharacterGetPayload<{ select: typeof STUNNING_STRIKE_SELECT }>;

// Base monk feature (not subclass) — gates on the monk entry's own level directly, mirroring rogueLevel in sneak-attack.ts.
function monkLevel(row: StunningStrikeRow): number {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk")?.level ?? 0;
}

async function attemptStunningStrike(
  ctx: CharacterTxContext<StunningStrikeRow, AttemptStunningStrikeOperation>,
): Promise<StunningStrikeAttemptResult> {
  const { tx, row, op, characterId, batchId, sessionId } = ctx;

  if (!hasStunningStrike(monkLevel(row))) {
    throw new InvalidStunningStrikeOperationError(`Only a monk (level ${STUNNING_STRIKE_LEVEL}+) has Stunning Strike`);
  }
  const edition = editionOf(row);
  if (!canAttemptStunningStrike({ usedThisTurn: op.usedThisTurn }, edition)) {
    throw new InvalidStunningStrikeOperationError("Stunning Strike can only be attempted once per turn");
  }

  // Proficiency bonus is total-character-level based, not monk-level — matches every DC formula in this codebase.
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const abilityScores = row.abilityScores as Record<string, number>;
  const dc = monkSaveDC(abilityScores, profBonus);

  // Spend before rolling — an insufficient resource throws here, so a failed spend never reaches (or narrates) a save attempt.
  await applySpendResourceInTx(tx, characterId, { type: "spendResource", key: monkPoolKey(edition) }, batchId, sessionId);

  const roll = 1 + Math.floor(Math.random() * 20);
  const outcome = resolveStunningStrikeOutcome(roll, dc);
  const summary = stunningStrikeSummary(dc, roll, outcome, edition);

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
