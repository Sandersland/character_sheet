// The hit-die roll for the HP step (#887, #1172). Lazy so the 3D dice stack
// loads only when the player actually rolls, and only for the Animated
// dice-roll preference (#945) — Quick skips it entirely, resolving the roll
// instantly. DiceRoller always self-rolls on mount and can't re-display a
// held value, so HitPointsStep keeps it mounted (hiding it via `hidden`, not
// unmounting) once a roll exists — the settled die lingers with its result
// until the player continues.

import { lazy, Suspense, useEffect, useRef } from "react";

import { useDiceRollStyle } from "@/features/dice/DiceRollStyleProvider";
import { rollSpec, type RollResult } from "@/lib/dice";

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
  const { style } = useDiceRollStyle();
  // Ref-guarded so StrictMode's dev-only double effect invoke fires the roll
  // exactly once per mount instead of resolving it twice.
  const firedRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (style !== "quick" || firedRef.current) return;
    firedRef.current = true;
    onResultRef.current(rollSpec({ count: 1, faces }));
  }, [style, faces]);

  if (style === "quick") return null;

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
