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

import type { RulesEdition } from "@character-sheet/shared-types";
import type { ImposeOpenHandRiderOperation, OpenHandRider, OpenHandTechniqueOperation } from "@character-sheet/contracts";

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { editionOf } from "@/lib/rules/edition.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { monkSaveDC } from "./monk.js";
import { resolveSubclassSlug, type SubclassSlug } from "./subclass-slug.js";

export class InvalidOpenHandTechniqueOperationError extends Error {}

// Open Hand Technique's grant level (#1337): Open Hand monk L3 in BOTH
// editions (SRD 5.2 / PHB'24 p.90, SRD 5.1 / PHB'14 p.78 — matching the 2014
// Way of the Open Hand's own Open Hand Technique at 3rd level) —
// edition-invariant, so no `edition` parameter. The single source for this
// gate; openHandTechniqueRider imports hasOpenHandTechnique rather than
// re-declaring the threshold.
export const OPEN_HAND_TECHNIQUE_LEVEL = 3;

/** Whether an Open Hand monk entry (its own level, never `character.level`) has Open Hand Technique. */
export function hasOpenHandTechnique(monkLevel: number): boolean {
  return monkLevel >= OPEN_HAND_TECHNIQUE_LEVEL;
}

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

// Addle's duration text (#1501): the only clause that forks. Verified
// against each edition's own source directly, reconciling the pre-#1501
// disagreement between this row's old wording and the module comment —
// SRD 5.2 (dnd5eapi.co 2024 API text): "The target can't make Opportunity
// Attacks until the start of its [the TARGET's] next turn." SRD 5.1
// (dnd5eapi.co 2014 API text): "It can't take reactions until the end of
// your [the MONK's] next turn." The two forks on both the reaction scope
// (all reactions vs. Opportunity Attacks specifically) AND whose next turn
// the clock runs to (the monk's vs. the target's) — 2014's window is
// materially longer, not a wording variant of 2024's.
function addleClause(edition: RulesEdition): string {
  return edition === "EDITION_2014"
    ? "the target can't take reactions until the end of your next turn"
    : "the target can't make Opportunity Attacks until the start of its next turn";
}

export function openHandRiderSummary(
  rider: OpenHandRider,
  dc: number,
  roll: number | undefined,
  outcome: OpenHandRiderOutcome,
  edition: RulesEdition,
): string {
  if (rider === "addle") {
    return `Open Hand Technique — Addle (no save): ${addleClause(edition)}.`;
  }
  const base = `Open Hand Technique — ${RIDER_LABEL[rider]} (${RIDER_SAVE[rider]} save), DC ${dc}, target rolled ${roll}`;
  return outcome === "applied"
    ? `${base}: failed the save — ${RIDER_EFFECT[rider]}.`
    : `${base}: made the save — no effect.`;
}

const OPEN_HAND_TECHNIQUE_SELECT = {
  experiencePoints: true,
  abilityScores: true,
  rulesEdition: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, level: true, subclass: true, subclassRef: { select: { slug: true } } },
  },
} satisfies Prisma.CharacterSelect;

type OpenHandTechniqueRow = Prisma.CharacterGetPayload<{ select: typeof OPEN_HAND_TECHNIQUE_SELECT }>;

// Both editions' Open Hand subclasses grant this feature — "Warrior of the
// Open Hand" (SRD 5.2, EDITION_2024) and "Way of the Open Hand" (SRD 5.1,
// EDITION_2014, #1501) are SEPARATE subclasses (different names, different
// slugs), not one subclass forked across editions, so a character can only
// ever resolve to one of the two — matching against either slug is safe.
const OPEN_HAND_SLUGS: readonly SubclassSlug[] = ["monk-warrior-of-the-open-hand", "monk-way-of-the-open-hand"];

// Open Hand Technique is a subclass feature, unlike Stunning Strike's
// base-class monkLevel() gate — so it checks the monk entry's own subclass
// identity too, resolved via resolveSubclassSlug (#1277: FK preferred, exact
// normalized name as fallback). Was substring-matched on the words "open
// hand" — the same failure class #1339 fixed at the DERIVED_ACTIONS gate.
function monkEntry(row: OpenHandTechniqueRow) {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk");
}

function isOpenHandFamily(row: OpenHandTechniqueRow): boolean {
  const monk = monkEntry(row);
  const slug = monk && resolveSubclassSlug("monk", monk);
  return !!slug && OPEN_HAND_SLUGS.includes(slug);
}

async function imposeOpenHandRider(
  ctx: CharacterTxContext<OpenHandTechniqueRow, ImposeOpenHandRiderOperation>,
): Promise<OpenHandRiderResult> {
  const { row, op, characterId, tx, batchId, sessionId } = ctx;
  const monk = monkEntry(row);

  if (!monk || !hasOpenHandTechnique(monk.level) || !isOpenHandFamily(row)) {
    throw new InvalidOpenHandTechniqueOperationError(
      `Only an Open Hand monk (level ${OPEN_HAND_TECHNIQUE_LEVEL}+) has Open Hand Technique`,
    );
  }
  if (!canImposeOpenHandRider({ usedThisTurn: op.usedThisTurn })) {
    throw new InvalidOpenHandTechniqueOperationError("Open Hand Technique can only be imposed once per turn");
  }

  // fallow-ignore-next-line code-duplication -- the level/profBonus/DC/edition read is intentionally repeated per Open Hand vertical (mirrors quivering-palm.ts's/stunning-strike.ts's own identical block) rather than a shared helper, matching every other monk save-DC vertical in this file family
  // Proficiency bonus is a character-total-level function (not monk-level),
  // matching every other DC formula in this codebase (deriveEntryScopedResources).
  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const abilityScores = row.abilityScores as Record<string, number>;
  const dc = monkSaveDC(abilityScores, profBonus);
  const edition = editionOf(row);

  const roll = op.rider === "addle" ? undefined : 1 + Math.floor(Math.random() * 20);
  const outcome = resolveOpenHandRiderOutcome(op.rider, roll ?? 0, dc);
  const summary = openHandRiderSummary(op.rider, dc, roll, outcome, edition);

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
