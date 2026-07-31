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
  /**
   * A result already decided elsewhere (#1528) — a server-authoritative roll
   * (Second Wind's heal: `resolveEffectSpec`, backend) that the dice must
   * animate TOWARD rather than decide themselves. When set, `roll()` skips
   * its own `rollSpec()` call and tumbles onto this result instead — the
   * roll stays deterministic (the server already applied it), only the
   * animation is client-side. Absent for every other caller, which keeps
   * rolling client-side as before.
   */
  forcedResult?: RollResult;
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
