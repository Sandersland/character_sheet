import { abilityModifier, ABILITY_ORDER } from "@/lib/abilities";
import { POINT_BUY_BUDGET, STANDARD_ARRAY, pointBuyCost, totalPointBuyCost } from "@/lib/abilityGen";
import type { AbilityMethod } from "@/hooks/useCharacterDraft";
import type { AbilityName, AbilityScores } from "@/types/character";

// Pure ability-assignment logic for the creation ability panel (#1161): the
// point-buy budget maths, pool slot assignment, and the PHB'24 background spread
// transitions — kept out of AbilityAssignmentPanel so it stays presentation-only.
// The generation methods themselves (dice, standard array, cost table) still
// live in abilityGen.

export type AbilityAssignments = Record<AbilityName, number | null>;

const POINT_BUY_FLOOR = 8;
const POINT_BUY_CEILING = 15;

export const EMPTY_ASSIGNMENTS: AbilityAssignments = {
  strength: null,
  dexterity: null,
  constitution: null,
  intelligence: null,
  wisdom: null,
  charisma: null,
};

/** Point-buy points left over `scores` (out of the 27-point budget). */
export function remainingPoints(scores: AbilityScores): number {
  return POINT_BUY_BUDGET - totalPointBuyCost(Object.values(scores));
}

/** Whether `ability` can go up one point buy step (ceiling + budget gated). */
export function canIncrement(scores: AbilityScores, ability: AbilityName): boolean {
  const current = scores[ability];
  if (current >= POINT_BUY_CEILING) return false;
  const stepCost = pointBuyCost(current + 1) - pointBuyCost(current);
  return stepCost <= remainingPoints(scores);
}

/** Whether `ability` can go down one point buy step (floor gated). */
export function canDecrement(scores: AbilityScores, ability: AbilityName): boolean {
  return scores[ability] > POINT_BUY_FLOOR;
}

/** Applies a ±1 point-buy step; returns `scores` unchanged if the step is illegal. */
export function adjustPointBuy(scores: AbilityScores, ability: AbilityName, delta: number): AbilityScores {
  const next = scores[ability] + delta;
  if (next < POINT_BUY_FLOOR || next > POINT_BUY_CEILING) return scores;
  const candidate = { ...scores, [ability]: next };
  if (totalPointBuyCost(Object.values(candidate)) > POINT_BUY_BUDGET) return scores;
  return candidate;
}

/** Assigns pool `slotIndex` to `ability`, stealing it from any prior owner and
 *  re-materializing the derived scores from the pool. */
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

/** Clears the pool slot on a single ability, leaving the others untouched. */
export function clearSlot(assignments: AbilityAssignments, ability: AbilityName): AbilityAssignments {
  return { ...assignments, [ability]: null };
}

/** Pool indices currently backing an ability. */
export function usedSlotIndices(assignments: AbilityAssignments): Set<number> {
  const used = new Set<number>();
  for (const a of ABILITY_ORDER) {
    const idx = assignments[a];
    if (idx !== null) used.add(idx);
  }
  return used;
}

export type SpreadMode = "twoOne" | "oneOneOne";

/** The PHB'24 spread implied by an assignment: three explicit +1s is oneOneOne, else twoOne. */
export function spreadMode(assignment: Partial<Record<AbilityName, number>>): SpreadMode {
  const values = Object.values(assignment);
  return values.length === 3 && values.every((v) => v === 1) ? "oneOneOne" : "twoOne";
}

/** Sets the +2 ability, keeping an existing +1 (unless it's the new pick) and evicting the prior +2. */
export function setPlusTwo(
  assignment: Partial<Record<AbilityName, number>>,
  abilities: AbilityName[],
  ability: AbilityName,
): Partial<Record<AbilityName, number>> {
  const plusOne = abilities.find((a) => assignment[a] === 1 && a !== ability);
  return { [ability]: 2, ...(plusOne ? { [plusOne]: 1 } : {}) };
}

/** Sets the +1 ability, keeping an existing +2 (unless it's the new pick) and evicting the prior +1. */
export function setPlusOne(
  assignment: Partial<Record<AbilityName, number>>,
  abilities: AbilityName[],
  ability: AbilityName,
): Partial<Record<AbilityName, number>> {
  const plusTwo = abilities.find((a) => assignment[a] === 2 && a !== ability);
  return { ...(plusTwo ? { [plusTwo]: 2 } : {}), [ability]: 1 };
}

/** +1 to each of the background's three abilities. */
export function toOneOneOne(abilities: AbilityName[]): Partial<Record<AbilityName, number>> {
  return Object.fromEntries(abilities.map((a) => [a, 1]));
}

/** The +2/+1 mode starts empty — the player picks each target. */
export function toTwoOne(): Partial<Record<AbilityName, number>> {
  return {};
}

/** Pool + assignment + score defaults when the player switches to a method. */
export function methodDefaults(method: AbilityMethod): {
  pool: number[] | null;
  assignments: AbilityAssignments;
  scores?: AbilityScores;
} {
  if (method === "standardArray") {
    return { pool: [...STANDARD_ARRAY], assignments: EMPTY_ASSIGNMENTS };
  }
  if (method === "pointBuy") {
    return {
      pool: null,
      assignments: EMPTY_ASSIGNMENTS,
      scores: {
        strength: POINT_BUY_FLOOR,
        dexterity: POINT_BUY_FLOOR,
        constitution: POINT_BUY_FLOOR,
        intelligence: POINT_BUY_FLOOR,
        wisdom: POINT_BUY_FLOOR,
        charisma: POINT_BUY_FLOOR,
      },
    };
  }
  // roll + manual both start with an empty, poolless slate.
  return { pool: null, assignments: EMPTY_ASSIGNMENTS };
}

/** A pool-backed method reads its base scores from assigned slots, not a stored score. */
export function isPoolMethod(method: AbilityMethod): boolean {
  return method === "roll" || method === "standardArray";
}

export interface AbilityRow {
  ability: AbilityName;
  /** Base score before the background bonus; null for an unassigned pool row. */
  base: number | null;
  /** Background bonus applied to this ability (0 when none). */
  bonus: number;
  total: number | null;
  mod: number | null;
  recommended: boolean;
}

/** The per-ability display rows: base (from pool slot or stored score), the
 *  background bonus, and the derived total + modifier. */
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
