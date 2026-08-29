import { abilityModifier, ABILITY_ORDER } from "@/lib/abilities";
import { pointBuyCost, totalPointBuyCost } from "@/lib/abilityGen";
import type { AbilityMethod } from "@/hooks/useCharacterDraft";
import type { AbilityGenerationConfig, AbilityName, AbilityScores } from "@/types/character";

export type AbilityAssignments = Record<AbilityName, number | null>;

type PointBuyConfig = AbilityGenerationConfig["pointBuy"];

export const EMPTY_ASSIGNMENTS: AbilityAssignments = {
  strength: null,
  dexterity: null,
  constitution: null,
  intelligence: null,
  wisdom: null,
  charisma: null,
};

export function remainingPoints(config: PointBuyConfig, scores: AbilityScores): number {
  return config.budget - totalPointBuyCost(config, Object.values(scores));
}

export function canIncrement(config: PointBuyConfig, scores: AbilityScores, ability: AbilityName): boolean {
  const current = scores[ability];
  if (current >= config.ceiling) return false;
  const stepCost = pointBuyCost(config, current + 1) - pointBuyCost(config, current);
  return stepCost <= remainingPoints(config, scores);
}

export function canDecrement(config: PointBuyConfig, scores: AbilityScores, ability: AbilityName): boolean {
  return scores[ability] > config.floor;
}

export function adjustPointBuy(config: PointBuyConfig, scores: AbilityScores, ability: AbilityName, delta: number): AbilityScores {
  const next = scores[ability] + delta;
  if (next < config.floor || next > config.ceiling) return scores;
  const candidate = { ...scores, [ability]: next };
  if (totalPointBuyCost(config, Object.values(candidate)) > config.budget) return scores;
  return candidate;
}

export function assignSlot(
  assignments: AbilityAssignments,
  scores: AbilityScores,
  pool: number[],
  ability: AbilityName,
  slotIndex: number,
): { assignments: AbilityAssignments; scores: AbilityScores } {
  const nextAssignments = { ...assignments };
  for (const other of ABILITY_ORDER) {
    if (nextAssignments[other] === slotIndex) nextAssignments[other] = null;
  }
  nextAssignments[ability] = slotIndex;

  const nextScores = { ...scores };
  for (const a of ABILITY_ORDER) {
    const idx = nextAssignments[a];
    if (idx !== null) nextScores[a] = pool[idx];
  }
  return { assignments: nextAssignments, scores: nextScores };
}

export function clearSlot(assignments: AbilityAssignments, ability: AbilityName): AbilityAssignments {
  return { ...assignments, [ability]: null };
}

export function usedSlotIndices(assignments: AbilityAssignments): Set<number> {
  const used = new Set<number>();
  for (const a of ABILITY_ORDER) {
    const idx = assignments[a];
    if (idx !== null) used.add(idx);
  }
  return used;
}

export type SpreadMode = "twoOne" | "oneOneOne";

/** The PHB'24 ability-score spread an assignment implies. */
export function spreadMode(assignment: Partial<Record<AbilityName, number>>): SpreadMode {
  const values = Object.values(assignment);
  return values.length === 3 && values.every((v) => v === 1) ? "oneOneOne" : "twoOne";
}

export function setPlusTwo(
  assignment: Partial<Record<AbilityName, number>>,
  abilities: AbilityName[],
  ability: AbilityName,
): Partial<Record<AbilityName, number>> {
  const plusOne = abilities.find((a) => assignment[a] === 1 && a !== ability);
  return { [ability]: 2, ...(plusOne ? { [plusOne]: 1 } : {}) };
}

export function setPlusOne(
  assignment: Partial<Record<AbilityName, number>>,
  abilities: AbilityName[],
  ability: AbilityName,
): Partial<Record<AbilityName, number>> {
  const plusTwo = abilities.find((a) => assignment[a] === 2 && a !== ability);
  return { ...(plusTwo ? { [plusTwo]: 2 } : {}), [ability]: 1 };
}

export function toOneOneOne(abilities: AbilityName[]): Partial<Record<AbilityName, number>> {
  return Object.fromEntries(abilities.map((a) => [a, 1]));
}

export function toTwoOne(): Partial<Record<AbilityName, number>> {
  return {};
}

export function methodDefaults(method: AbilityMethod, config: AbilityGenerationConfig): {
  pool: number[] | null;
  assignments: AbilityAssignments;
  scores?: AbilityScores;
} {
  if (method === "standardArray") {
    return { pool: [...config.standardArray], assignments: EMPTY_ASSIGNMENTS };
  }
  if (method === "pointBuy") {
    const floor = config.pointBuy.floor;
    return {
      pool: null,
      assignments: EMPTY_ASSIGNMENTS,
      scores: {
        strength: floor,
        dexterity: floor,
        constitution: floor,
        intelligence: floor,
        wisdom: floor,
        charisma: floor,
      },
    };
  }
  return { pool: null, assignments: EMPTY_ASSIGNMENTS };
}

export function isPoolMethod(method: AbilityMethod): boolean {
  return method === "roll" || method === "standardArray";
}

export function sumBonusMaps(
  ...maps: Partial<Record<AbilityName, number>>[]
): Partial<Record<AbilityName, number>> {
  const sum: Partial<Record<AbilityName, number>> = {};
  for (const map of maps) {
    for (const [ability, amount] of Object.entries(map)) {
      sum[ability as AbilityName] = (sum[ability as AbilityName] ?? 0) + (amount ?? 0);
    }
  }
  return sum;
}

interface AbilityRow {
  ability: AbilityName;
  /** Base score before the background/species bonus; null for an unassigned pool row. */
  base: number | null;
  /** Combined background + species (#1681) bonus applied to this ability (0 when none). */
  bonus: number;
  total: number | null;
  mod: number | null;
  recommended: boolean;
}

export function abilityRows(input: {
  method: AbilityMethod;
  scores: AbilityScores;
  pool: number[] | null;
  assignments: AbilityAssignments;
  bonus: Partial<Record<AbilityName, number>>;
  primaryAbility: AbilityName[];
}): AbilityRow[] {
  const { method, scores, pool, assignments, bonus, primaryAbility } = input;
  const pooled = isPoolMethod(method);
  return ABILITY_ORDER.map((ability) => {
    const slot = assignments[ability];
    const base = pooled ? (pool && slot !== null ? pool[slot] : null) : scores[ability];
    const bonusValue = bonus[ability] ?? 0;
    const total = base === null ? null : base + bonusValue;
    return {
      ability,
      base,
      bonus: bonusValue,
      total,
      mod: total === null ? null : abilityModifier(total),
      recommended: primaryAbility.includes(ability),
    };
  });
}
