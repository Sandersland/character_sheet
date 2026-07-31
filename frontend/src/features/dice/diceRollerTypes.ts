import type { RollResult, RollSpec } from "@/lib/dice";

/**
 * Shared prop contract for every dice-roller component (`DiceRoller`,
 * `PhysicsDiceRoller`). Keeping this in one place is what makes the two
 * interchangeable — `DiceRollSequence`'s `roller` prop is typed against this
 * so it can drive either one without caring which.
 */
export interface DiceRollerProps {
  /** What to roll, e.g. `{ count: 4, faces: 6, dropLowest: 1 }` for 4d6 drop lowest. */
  spec: RollSpec;
  /** Called once the roll settles, with the full per-die result. */
  onResult?: (result: RollResult) => void;
  /** Bump this (e.g. a counter) to trigger a fresh roll, including re-rolls. */
  rollKey?: number | string;
  /** Roll immediately on mount if no `rollKey` is driving this instance. */
  autoRollOnMount?: boolean;
  /** Optional caption shown above the dice (e.g. "Hit dice", "Attack roll"). */
  label?: string;
  /** When true, resolve immediately with no animation — interrupts an
   *  in-flight tumble and makes any roll that starts while set settle instantly. */
  skip?: boolean;
  /** Show the settled total below the dice (e.g. "= 14"). Defaults to true for
   *  standalone use; callers that surface the total elsewhere (e.g.
   *  DiceRollSequence's chip row) pass false to avoid the redundant readout. */
  showTotal?: boolean;
  className?: string;
}
