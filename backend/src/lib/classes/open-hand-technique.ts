// Open Hand Technique, SRD 5.2 / PHB'24 p.90, Warrior of the Open Hand L3 — the Flurry counterpart to attemptStunningStrike.
// Once per turn is client-asserted — no server-side turn state to cross-check.

import type { RulesEdition } from "@character-sheet/shared-types";
import type { ImposeOpenHandRiderOperation, OpenHandRider, OpenHandTechniqueOperation } from "@character-sheet/contracts";

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { editionOf } from "@/lib/rules/edition.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { monkSaveDC } from "./ki-focus.js";
import { resolveSubclassSlug, type SubclassSlug } from "./subclass-slug.js";

export class InvalidOpenHandTechniqueOperationError extends Error {}

// SRD 5.2 / PHB'24 p.90; SRD 5.1 / PHB'14 p.78 (Way of the Open Hand's own Open Hand Technique) — edition-invariant.
export const OPEN_HAND_TECHNIQUE_LEVEL = 3;

// monkLevel is the entry's own level, never character.level.
export function hasOpenHandTechnique(monkLevel: number): boolean {
  return monkLevel >= OPEN_HAND_TECHNIQUE_LEVEL;
}

export type OpenHandRiderOutcome = "applied" | "resisted";

export interface OpenHandRiderResult {
  rider: OpenHandRider;
  dc: number;
  // Absent for Addle — it has no save to roll.
  roll?: number;
  outcome: OpenHandRiderOutcome;
  summary: string;
}

export function canImposeOpenHandRider(input: { usedThisTurn: boolean }): boolean {
  return !input.usedThisTurn;
}

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

// SRD 5.2 / PHB'24 p.90 vs SRD 5.1 / PHB'14 p.78 — the reaction scope and
// whose next turn the clock runs to differ materially, not just wording.
function addleClause(edition: RulesEdition): string {
  switch (edition) {
    case "EDITION_2014":
      return "the target can't take reactions until the end of your next turn";
    case "EDITION_2024":
      return "the target can't make Opportunity Attacks until the start of its next turn";
    default: {
      const exhaustive: never = edition;
      throw new Error(`addleClause: unhandled edition ${String(exhaustive)}`);
    }
  }
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

// The two editions' Open Hand subclasses are SEPARATE subclass rows, not one row forked across editions — a character resolves to at most one, so matching either slug is safe.
const OPEN_HAND_SLUGS: readonly SubclassSlug[] = ["monk-warrior-of-the-open-hand", "monk-way-of-the-open-hand"];

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

  // fallow-ignore-next-line code-duplication -- intentionally repeated per monk save-DC vertical (mirrors the same pattern in applyQuiveringPalmOperations and applyStunningStrikeOperations) rather than a shared helper
  // Proficiency bonus is total-character-level based, not monk-level — matches every DC formula in this codebase.
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
