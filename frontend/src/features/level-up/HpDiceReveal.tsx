// The 3D hit-die roll for the HP step (#887, #1172). Lazy so the dice stack
// loads only when the player actually rolls. It always self-rolls on mount and
// can't re-display a held value, so HitPointsStep keeps it mounted (hiding it
// via `hidden`, not unmounting) once a roll exists — the settled die lingers
// with its result until the player continues.

import { lazy, Suspense } from "react";

import type { RollResult } from "@/lib/dice";

const DiceRoller = lazy(() => import("@/features/dice/DiceRoller"));

export default function HpDiceReveal({
  faces,
  die,
  onResult,
}: {
  faces: number;
  die: string;
  onResult: (result: RollResult) => void;
}) {
  return (
    <Suspense fallback={null}>
      <DiceRoller
        spec={{ count: 1, faces }}
        label={`Hit die — 1${die}`}
        onResult={onResult}
        autoRollOnMount
        showTotal={false}
        className="mt-4"
      />
    </Suspense>
  );
}
