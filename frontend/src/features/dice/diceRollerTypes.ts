import type { RollResult, RollSpec } from "@/lib/dice";

// Shared by DiceRoller and PhysicsDiceRoller so DiceRollSequence's roller prop can drive either one interchangeably.
export interface DiceRollerProps {
  spec: RollSpec;
  onResult?: (result: RollResult) => void;
  // Bump to trigger a fresh roll, including re-rolls.
  rollKey?: number | string;
  // Rolls immediately on mount only when no rollKey is driving this instance.
  autoRollOnMount?: boolean;
  label?: string;
  // Resolves immediately with no animation, interrupting any in-flight tumble.
  skip?: boolean;
  // Defaults to true; DiceRollSequence's chip row passes false to avoid a redundant readout.
  showTotal?: boolean;
  className?: string;
}
