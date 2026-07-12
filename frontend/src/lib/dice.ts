/**
 * Generic dice-rolling engine. This is the one place `Math.random` is read
 * for rolling dice — `lib/abilityGen.ts`'s 4d6-drop-lowest generator and the
 * `<DiceRoller>` component (components/DiceRoller.tsx) both delegate here,
 * so every roll in the app (ability scores today; hit dice, attacks, and
 * saving throws later) shares the same engine and exposes the same
 * per-die detail instead of just a final sum.
 */

/** Roll mode for d20 checks/saves/attacks/initiative. */
export type RollMode = "normal" | "advantage" | "disadvantage";

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
  /** Advantage/disadvantage — honored only for a single d20 (see `usesAdvantage`). */
  mode?: RollMode;
  /**
   * 5e critical hit: doubles the number of damage **dice** rolled (`count`),
   * leaving `modifier` single. Off by default so every existing d20/ability/save
   * spec is unchanged. Never combines with the advantage-d20 path — a crit spec
   * is a multi-die damage spec, so `usesAdvantage` already excludes it, and the
   * advantage branch wins if both are somehow set (crit is ignored there).
   */
  crit?: boolean;
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

/** The kept (non-dropped) d20 of a roll, or null when the spec isn't a single-d20 roll. */
export function keptD20(result: RollResult): DieRoll | null {
  if (result.spec.faces !== 20) return null;
  return result.dice.find((die) => !die.dropped) ?? null;
}

/** Kept-die natural 20 — a nat 20 on the DROPPED die (disadvantage) is not a crit. */
export function isNaturalTwenty(result: RollResult | null | undefined): boolean {
  return result ? keptD20(result)?.value === 20 : false;
}

/** Kept-die natural 1 — a miss on an attack roll. */
export function isNaturalOne(result: RollResult | null | undefined): boolean {
  return result ? keptD20(result)?.value === 1 : false;
}

/**
 * Whether a spec's advantage/disadvantage mode actually applies. Guard:
 * only a single d20 (checks, saves, attacks, initiative) — multi-die damage
 * specs and non-d20 dice ignore `mode` and roll normally.
 */
export function usesAdvantage(spec: RollSpec): boolean {
  return (
    (spec.mode === "advantage" || spec.mode === "disadvantage") &&
    spec.faces === 20 &&
    spec.count === 1
  );
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

  let droppedIndices: Set<number>;
  if (usesAdvantage(spec)) {
    // Keep the higher (advantage) or lower (disadvantage) die; drop the rest.
    // Ties keep the first index, so exactly one die is ever kept.
    const keepHigher = spec.mode === "advantage";
    let keepIndex = 0;
    for (let i = 1; i < values.length; i++) {
      if (keepHigher ? values[i] > values[keepIndex] : values[i] < values[keepIndex]) keepIndex = i;
    }
    droppedIndices = new Set(values.map((_, index) => index).filter((index) => index !== keepIndex));
  } else {
    const ascendingByValue = values
      .map((value, index) => ({ value, index }))
      .sort((a, b) => a.value - b.value);
    droppedIndices = new Set(ascendingByValue.slice(0, dropLowest).map((entry) => entry.index));
  }

  const dice: DieRoll[] = values.map((value, index) => ({
    value,
    dropped: droppedIndices.has(index),
  }));

  const total = dice.reduce((sum, die) => sum + (die.dropped ? 0 : die.value), 0) + modifier;

  return { dice, modifier, total, spec };
}

/**
 * How many dice `rollSpec` actually rolls: 2 for an advantage d20, double
 * `count` for a crit damage spec, else `count`. The advantage guard is checked
 * first so a crit never routes through the advantage branch (see `RollSpec.crit`).
 */
function critCount(spec: RollSpec): number {
  return spec.crit ? spec.count * 2 : spec.count;
}

/** Rolls a full `RollSpec`, dropping the lowest `dropLowest` dice (or the un-taken advantage die). */
export function rollSpec(spec: RollSpec): RollResult {
  const count = usesAdvantage(spec) ? 2 : critCount(spec);
  const values = Array.from({ length: count }, () => rollDie(spec.faces));
  return summarizeRoll(values, spec);
}

/** Human-readable label for a roll spec, e.g. "4d6 drop lowest", "1d8 + 3". */
export function formatRollSpec(spec: RollSpec): string {
  const { faces, modifier = 0, dropLowest = 0 } = spec;
  // Show the doubled dice count on a crit so the Session Log reads honestly.
  let label = `${critCount(spec)}d${faces}`;
  if (dropLowest > 0) {
    label += dropLowest === 1 ? " drop lowest" : ` drop lowest ${dropLowest}`;
  }
  if (modifier > 0) {
    label += ` + ${modifier}`;
  } else if (modifier < 0) {
    label += ` - ${Math.abs(modifier)}`;
  }
  if (usesAdvantage(spec)) {
    label += ` (${spec.mode})`;
  }
  if (spec.crit) {
    label += " (crit)";
  }
  return label;
}

/**
 * Injects raw kept die faces into a spec label for the Session Log, matching
 * `RollResultToast`'s inline breakdown rendering: the leading `NdM` token is
 * suffixed with `(face, face, …)`, and any trailing modifier from `specLabel`
 * is preserved as-is (so a Unicode-minus modifier from `formatRollSpec` carries
 * through unchanged). e.g. `formatRollBreakdown("1d20 + 5", [12])` → "1d20 (12) + 5".
 * Returns `specLabel` untouched when `faces` is empty or the leading token is
 * not an `NdM` spec.
 */
export function formatRollBreakdown(specLabel: string, faces: number[]): string {
  if (faces.length === 0) return specLabel;
  // Match the leading `NdM` dice token; everything after it (modifiers, etc.) is preserved.
  return specLabel.replace(/^(\d+d\d+)/, `$1 (${faces.join(", ")})`);
}
