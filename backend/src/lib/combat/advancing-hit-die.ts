import { hitDieFace } from "@/lib/srd/srd.js";

/**
 * The hit die a level-up advances: the advancing class's catalog die, falling
 * back to the character's own persisted die when that class row can't be
 * reached (a detached entry whose `classId` is null).
 *
 * ONE resolver for both seams (#1380): the commit path (applyLevelUpOp) and the
 * plan preview (hitPointsStep) route through this, which is what makes the
 * served `meta.averageGain` equal the HP the transaction commits by
 * construction rather than by two matching copies of the lookup.
 *
 * No `edition` parameter: the fixed-average table (d6→4, d8→5, d10→6, d12→7)
 * and the max(1, …) per-level floor read identically in SRD 5.1 and SRD 5.2
 * (PHB'14 p. 15 / PHB'24 p. 36).
 */
export function advancingHitDie(
  entryHitDie: string | null | undefined,
  characterHitDie: string,
): { die: string; faces: number } {
  const die = entryHitDie ?? characterHitDie;
  return { die, faces: hitDieFace(die) };
}
