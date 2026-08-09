// Stunning Strike (Monk L5) live-play automation — the monk counterpart to
// applySneakAttackOperations. SRD 5.2 / PHB'24 p.88 (2024): once per turn,
// after hitting with an Unarmed Strike or a monk weapon, spend 1 focus to
// force a Constitution save against the monk's focus save DC (8 + prof +
// Wis): fail → Stunned until the start of the monk's next turn; success → the
// target's speed is halved until the start of the monk's next turn, and the
// next attack roll against it before then has advantage. SRD 5.1 / PHB'14
// p.77 (2014, #1500): NO once-per-turn cap (any melee weapon attack hit can
// attempt one, as long as ki remains), spends 1 ki against the monk's ki save
// DC (same formula), and NO success rider at all — a made save simply does
// nothing further; a failed save is Stunned until the END of the monk's next
// turn (not the start).
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

import type { RulesEdition } from "@character-sheet/shared-types";
import type { AttemptStunningStrikeOperation, StunningStrikeOperation } from "@character-sheet/contracts";

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { editionOf } from "@/lib/rules/edition.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { applySpendResourceInTx } from "./resources.js";
import { monkSaveDC, monkPoolKey } from "./monk.js";

export class InvalidStunningStrikeOperationError extends Error {}

// Stunning Strike's grant level (#1337): monk L5 in BOTH editions (SRD 5.1 /
// PHB'14 p.77, SRD 5.2 / PHB'24 p.88 — see the module header's citations) —
// edition-invariant, so no `edition` parameter. The single source for this
// gate; stunningStrikeRider imports hasStunningStrike rather than
// re-declaring the threshold.
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

/**
 * Once-per-turn guard — pure so the red/green test can exercise it directly.
 * 2014 (SRD 5.1 / PHB'14 p.77) has NO once-per-turn cap at all: any melee
 * weapon attack hit can attempt one, gated only on ki remaining (enforced by
 * the resource spend below, not here) — `edition` last, one function per rule.
 */
export function canAttemptStunningStrike(input: { usedThisTurn: boolean }, edition: RulesEdition): boolean {
  return edition === "EDITION_2014" ? true : !input.usedThisTurn;
}

/** Constitution save (both editions): fail (roll < DC) is Stunned. 2024 success halves speed + grants advantage; 2014 has no success rider (see stunningStrikeSummary). */
export function resolveStunningStrikeOutcome(roll: number, dc: number): StunningStrikeOutcome {
  return roll >= dc ? "success" : "fail";
}

/**
 * 2014 (SRD 5.1 / PHB'14 p.77): a failed save is Stunned until the END of the
 * monk's next turn (not the start, unlike 2024) and a made save does nothing
 * further — no half-speed/advantage rider exists in SRD 5.1 at all.
 */
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

  if (!hasStunningStrike(monkLevel(row))) {
    throw new InvalidStunningStrikeOperationError(`Only a monk (level ${STUNNING_STRIKE_LEVEL}+) has Stunning Strike`);
  }
  const edition = editionOf(row);
  if (!canAttemptStunningStrike({ usedThisTurn: op.usedThisTurn }, edition)) {
    throw new InvalidStunningStrikeOperationError("Stunning Strike can only be attempted once per turn");
  }

  // Proficiency bonus is a character-total-level function (not monk-level),
  // matching every other DC formula in this codebase (deriveEntryScopedResources).
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const abilityScores = row.abilityScores as Record<string, number>;
  const dc = monkSaveDC(abilityScores, profBonus);

  // Spend 1 ki/focus BEFORE rolling (#1500: monkPoolKey resolves the pool
  // name per edition) — insufficient resource throws
  // InvalidResourceOperationError (its own 400), so a failed spend never
  // reaches (or narrates) a save attempt.
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
