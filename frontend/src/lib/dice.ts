/**
 * Generic dice-rolling engine. This is the one place `Math.random` is read
 * for rolling dice — `lib/abilityGen.ts`'s 4d6-drop-lowest generator and the
 * `<DiceRoller>` component (components/DiceRoller.tsx) both delegate here,
 * so every roll in the app (ability scores today; hit dice, attacks, and
 * saving throws later) shares the same engine and exposes the same
 * per-die detail instead of just a final sum.
 */

/** A single die roll spec: e.g. `{ count: 4, faces: 6, dropLowest: 1 }` is "4d6 drop lowest". */
export interface RollSpec {
  /** How many dice to roll. */
  count: number;
  /** Number of faces per die (6, 8, 10, 12, 20, ...). */
  faces: number;
  /** Flat modifier added to the total after dropped dice are excluded. */
  modifier?: number;
  /** How many of the lowest-rolled dice to exclude from the total (e.g. 1 for 4d6-drop-lowest). */
  dropLowest?: number;
}

/** One rolled die, in original roll order, flagged if it was dropped from the total. */
export interface DieRoll {
  value: number;
  dropped: boolean;
}

/** The full result of rolling a `RollSpec`. */
export interface RollResult {
  /** Each die's value, in the order it was rolled. */
  dice: DieRoll[];
  modifier: number;
  /** Sum of non-dropped dice plus `modifier`. */
  total: number;
  spec: RollSpec;
}

/** Rolls a single die with the given number of faces. The only place Math.random is read. */
export function rollDie(faces: number): number {
  return 1 + Math.floor(Math.random() * faces);
}

/**
 * Turns already-rolled face values into a full `RollResult`: flags the
 * lowest `spec.dropLowest` values as dropped (without disturbing roll
 * order, so the UI can animate dice in the order they were rolled while
 * still knowing which one(s) to dim) and sums the rest plus `spec.modifier`.
 * Pulled out of `rollSpec` so any source of per-die values — `rollDie`
 * here, or a physics roller reading values off settled dice — can share
 * the same drop/sum logic and produce an identical `RollResult` shape.
 */
export function summarizeRoll(values: number[], spec: RollSpec): RollResult {
  const { modifier = 0, dropLowest = 0 } = spec;

  const ascendingByValue = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const droppedIndices = new Set(ascendingByValue.slice(0, dropLowest).map((entry) => entry.index));

  const dice: DieRoll[] = values.map((value, index) => ({
    value,
    dropped: droppedIndices.has(index),
  }));

  const total = dice.reduce((sum, die) => sum + (die.dropped ? 0 : die.value), 0) + modifier;

  return { dice, modifier, total, spec };
}

/** Rolls a full `RollSpec`, dropping the lowest `dropLowest` dice from the total. */
export function rollSpec(spec: RollSpec): RollResult {
  const values = Array.from({ length: spec.count }, () => rollDie(spec.faces));
  return summarizeRoll(values, spec);
}

/** Human-readable label for a roll spec, e.g. "4d6 drop lowest", "1d8 + 3". */
export function formatRollSpec(spec: RollSpec): string {
  const { count, faces, modifier = 0, dropLowest = 0 } = spec;
  let label = `${count}d${faces}`;
  if (dropLowest > 0) {
    label += dropLowest === 1 ? " drop lowest" : ` drop lowest ${dropLowest}`;
  }
  if (modifier > 0) {
    label += ` + ${modifier}`;
  } else if (modifier < 0) {
    label += ` - ${Math.abs(modifier)}`;
  }
  return label;
}
