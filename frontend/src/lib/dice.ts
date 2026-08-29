// This is the one place Math.random is read for rolling dice — abilityGen's 4d6-drop-lowest generator and the DiceRoller component both delegate here.

export type RollMode = "normal" | "advantage" | "disadvantage";

export interface RollSpec {
  count: number;
  faces: number;
  modifier?: number;
  dropLowest?: number;
  mode?: RollMode;
  /** 5e critical hit: doubles `count`, leaving `modifier` single; never combines with the advantage-d20 path since usesAdvantage already excludes a multi-die crit spec. */
  crit?: boolean;
}

export interface DieRoll {
  value: number;
  dropped: boolean;
}

export interface RollResult {
  dice: DieRoll[];
  modifier: number;
  total: number;
  spec: RollSpec;
}

export function rollDie(faces: number): number {
  return 1 + Math.floor(Math.random() * faces);
}

export function keptD20(result: RollResult): DieRoll | null {
  if (result.spec.faces !== 20) return null;
  return result.dice.find((die) => !die.dropped) ?? null;
}

// A nat 20 on the DROPPED die (disadvantage) is not a crit.
export function isNaturalTwenty(result: RollResult | null | undefined): boolean {
  return result ? keptD20(result)?.value === 20 : false;
}

// nat 20 is just isCriticalRoll(result, 20), not a separate rule; Champion's Improved/Superior Critical widen critRange server-side, and this is the one place a roll is compared against it, never a hardcoded 20.
export function isCriticalRoll(result: RollResult | null | undefined, critRange: number): boolean {
  const face = result ? keptD20(result)?.value : undefined;
  return face !== undefined && face >= critRange;
}

export function isNaturalOne(result: RollResult | null | undefined): boolean {
  return result ? keptD20(result)?.value === 1 : false;
}

// Guard: only a single d20 (checks, saves, attacks, initiative) — multi-die damage specs and non-d20 dice ignore `mode` and roll normally.
export function usesAdvantage(spec: RollSpec): boolean {
  return (
    (spec.mode === "advantage" || spec.mode === "disadvantage") &&
    spec.faces === 20 &&
    spec.count === 1
  );
}

// Pulled out of rollSpec so any source of per-die values — rollDie here, or a physics roller reading values off settled dice — can share the same drop/sum logic and produce an identical RollResult shape.
export function summarizeRoll(values: number[], spec: RollSpec): RollResult {
  const { modifier = 0, dropLowest = 0 } = spec;

  let droppedIndices: Set<number>;
  if (usesAdvantage(spec)) {
    // Keep the higher (advantage) or lower (disadvantage) die; ties keep the first index, so exactly one die is ever kept.
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

// The advantage guard is checked first so a crit never routes through the advantage branch.
function critCount(spec: RollSpec): number {
  return spec.crit ? spec.count * 2 : spec.count;
}

export function rollSpec(spec: RollSpec): RollResult {
  const count = usesAdvantage(spec) ? 2 : critCount(spec);
  const values = Array.from({ length: count }, () => rollDie(spec.faces));
  return summarizeRoll(values, spec);
}

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

// Matches RollResultSeal's inline breakdown rendering.
export function formatRollBreakdown(specLabel: string, faces: number[]): string {
  if (faces.length === 0) return specLabel;
  return specLabel.replace(/^(\d+d\d+)/, `$1 (${faces.join(", ")})`);
}
