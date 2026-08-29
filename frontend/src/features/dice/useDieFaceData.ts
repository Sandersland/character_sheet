import { useEffect, useMemo } from "react";

import { computeFaceGroups, createDieGeometry, createVisualDieGeometry } from "@/lib/dieFaces";

// Shared by DiceRoller and PhysicsDiceRoller: groups/rounded come from the sharp logic geometry (used for label placement and face reading); visualGeometry is the separately-rounded mesh actually rendered.
export function useDieFaceData(faces: number) {
  const logicGeometry = useMemo(() => createDieGeometry(faces), [faces]);
  const visualGeometry = useMemo(() => createVisualDieGeometry(faces), [faces]);
  useEffect(
    () => () => {
      logicGeometry.dispose();
      visualGeometry.dispose();
    },
    [logicGeometry, visualGeometry],
  );

  const groups = useMemo(() => {
    const computed = computeFaceGroups(logicGeometry);
    // Trusted only when it found exactly one face per rolled value; false for the d100 box fallback.
    return computed.length === faces ? computed : [];
  }, [logicGeometry, faces]);

  // Every recognized die (a clean per-face grouping) is smooth-shaded; the d100 box fallback stays flat-shaded.
  const rounded = groups.length > 0;

  return { visualGeometry, groups, rounded };
}
