import { useEffect, useMemo } from "react";

import { computeFaceGroups, createDieGeometry, createVisualDieGeometry } from "@/lib/dieFaces";

/**
 * Builds (and disposes) the geometry + per-face data for one die type.
 * Shared by the scripted (`DiceRoller`) and physics (`PhysicsDiceRoller`)
 * rollers, since both need the same rendered geometry and face
 * normals/centroids — one die type's data is computed once per roller and
 * handed to every `DieMesh` instance it renders, rather than recomputed
 * per die. Returns the sharp *logic* geometry's face groups (normals/
 * centroids/label orientation — used for label placement, scripted-roller
 * landing targets, and physics-roller face reading) plus a separate
 * *visual* geometry that's what actually gets rendered, which may be
 * rounded (currently just the d6) while the logic geometry never is.
 */
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
    // Only trust the grouping if it found exactly one face per rolled value
    // (true for the supported platonic dice; false for the box fallback).
    return computed.length === faces ? computed : [];
  }, [logicGeometry, faces]);

  const rounded = faces === 6;

  return { visualGeometry, groups, rounded };
}
