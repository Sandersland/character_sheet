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
  // Guards against StrictMode's dev-only double effect invoke firing the roll twice.
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
