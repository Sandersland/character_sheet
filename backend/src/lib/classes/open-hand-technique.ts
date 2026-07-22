// Open Hand Technique (Warrior of the Open Hand L3, SRD 5.2 / PHB'24 p.90) —
// the monk counterpart to applySneakAttackOperations / attemptStunningStrike.
// When a Flurry of Blows strike hits, impose ONE rider: Addle (no save — the
// target can't take reactions until the start of your next turn), Push
// (Strength save or pushed up to 15 ft), or Topple (Dexterity save or Prone).
// DC = the monk's focus save DC (8 + prof + Wis); no Focus is spent here — the
// rider rides free on a Flurry hit (Flurry itself already spent the Focus).
//
// Target-rider modeling + roll ownership: same "no NPC combatant" simplification
// as Stunning Strike (see that module's header) — Push/Topple's save is a flat
// d20 with no modifier, exact DC, deliberate placeholder pending an NPC
// stat-block model. Addle never rolls (no save exists for it).
//
// Once per turn, client-asserted (mirrors Stunning Strike's usedThisTurn — no
// server-side turn state exists to cross-check). SRD 5.2 grants one rider
// choice per use of Flurry of Blows; Flurry is normally once per turn (bonus
// action economy), so this guard stops a monk with multiple Flurry strikes
// (Heightened Focus, #1244) from re-choosing a rider on every individual
// strike within the same Flurry use.

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { focusSaveDC } from "./monk.js";

export class InvalidOpenHandTechniqueOperationError extends Error {}

export type OpenHandRider = "addle" | "push" | "topple";

// Once per turn, client-asserted (mirrors AttemptStunningStrikeOperation).
export interface ImposeOpenHandRiderOperation {
  type: "imposeOpenHandRider";
  rider: OpenHandRider;
  usedThisTurn: boolean;
}

export type OpenHandTechniqueOperation = ImposeOpenHandRiderOperation;

export type OpenHandRiderOutcome = "applied" | "resisted";

export interface OpenHandRiderResult {
  rider: OpenHandRider;
  dc: number;
  /** Absent for Addle — it has no save to roll. */
  roll?: number;
  outcome: OpenHandRiderOutcome;
  summary: string;
}

/** Once-per-turn guard — pure so the red/green test can exercise it directly. */
export function canImposeOpenHandRider(input: { usedThisTurn: boolean }): boolean {
  return !input.usedThisTurn;
}

/** Addle always applies (no save). Push/Topple: a fail (roll < DC) means the effect lands. */
export function resolveOpenHandRiderOutcome(
  rider: OpenHandRider,
  roll: number,
  dc: number,
): OpenHandRiderOutcome {
  if (rider === "addle") return "applied";
  return roll < dc ? "applied" : "resisted";
}

const RIDER_LABEL: Record<OpenHandRider, string> = { addle: "Addle", push: "Push", topple: "Topple" };
const RIDER_SAVE: Record<OpenHandRider, string> = { addle: "", push: "Strength", topple: "Dexterity" };
const RIDER_EFFECT: Record<OpenHandRider, string> = {
  addle: "",
  push: "pushed up to 15 ft away",
  topple: "knocked prone",
};

function openHandRiderSummary(
  rider: OpenHandRider,
  dc: number,
  roll: number | undefined,
  outcome: OpenHandRiderOutcome,
): string {
  if (rider === "addle") {
    return "Open Hand Technique — Addle (no save): the target can't take reactions until the start of your next turn.";
  }
  const base = `Open Hand Technique — ${RIDER_LABEL[rider]} (${RIDER_SAVE[rider]} save), DC ${dc}, target rolled ${roll}`;
  return outcome === "applied"
    ? `${base}: failed the save — ${RIDER_EFFECT[rider]}.`
    : `${base}: made the save — no effect.`;
}

const OPEN_HAND_TECHNIQUE_SELECT = {
  experiencePoints: true,
  abilityScores: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, level: true, subclass: true },
  },
} satisfies Prisma.CharacterSelect;

type OpenHandTechniqueRow = Prisma.CharacterGetPayload<{ select: typeof OPEN_HAND_TECHNIQUE_SELECT }>;

// Open Hand Technique is a subclass feature (Warrior of the Open Hand), unlike
// Stunning Strike's base-class monkLevel() gate — so it checks the monk entry's
// own subclass string too (freeform display name; substring-matched like
// DERIVED_ACTIONS' grantSubclass in actions.ts).
function monkEntry(row: OpenHandTechniqueRow) {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk");
}

function isWarriorOfTheOpenHand(row: OpenHandTechniqueRow): boolean {
  return (monkEntry(row)?.subclass ?? "").toLowerCase().includes("open hand");
}

async function imposeOpenHandRider(
  ctx: CharacterTxContext<OpenHandTechniqueRow, ImposeOpenHandRiderOperation>,
): Promise<OpenHandRiderResult> {
  const { row, op, characterId, tx, batchId, sessionId } = ctx;
  const monk = monkEntry(row);

  if (!monk || monk.level < 3 || !isWarriorOfTheOpenHand(row)) {
    throw new InvalidOpenHandTechniqueOperationError(
      "Only a Warrior of the Open Hand monk (level 3+) has Open Hand Technique",
    );
  }
  if (!canImposeOpenHandRider({ usedThisTurn: op.usedThisTurn })) {
    throw new InvalidOpenHandTechniqueOperationError("Open Hand Technique can only be imposed once per turn");
  }

  // Proficiency bonus is a character-total-level function (not monk-level),
  // matching every other DC formula in this codebase (deriveEntryScopedResources).
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const abilityScores = row.abilityScores as Record<string, number>;
  const dc = focusSaveDC(abilityScores, profBonus);

  const roll = op.rider === "addle" ? undefined : 1 + Math.floor(Math.random() * 20);
  const outcome = resolveOpenHandRiderOutcome(op.rider, roll ?? 0, dc);
  const summary = openHandRiderSummary(op.rider, dc, roll, outcome);

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "imposeOpenHandRider",
    summary,
    data: { rider: op.rider, dc, roll: roll ?? null, outcome },
    batchId,
    sessionId,
  });

  return { rider: op.rider, dc, ...(roll !== undefined ? { roll } : {}), outcome, summary };
}

/**
 * Applies a batch of Open Hand Technique rider operations atomically. Mirrors
 * applyStunningStrikeOperations: one batchId, state re-read per op. Returns one
 * result per op (client surfaces the rider + DC/roll/outcome inline).
 */
export async function applyOpenHandTechniqueOperations(
  characterId: string,
  operations: OpenHandTechniqueOperation[],
): Promise<OpenHandRiderResult[]> {
  const results: OpenHandRiderResult[] = [];
  await runCharacterTransaction<typeof OPEN_HAND_TECHNIQUE_SELECT, OpenHandTechniqueOperation>(
    characterId,
    operations,
    {
      select: OPEN_HAND_TECHNIQUE_SELECT,
      notFound: (id) => new InvalidOpenHandTechniqueOperationError(`Character not found: ${id}`),
      applyOp: async (ctx) => {
        results.push(await imposeOpenHandRider(ctx));
      },
    },
  );
  return results;
}
