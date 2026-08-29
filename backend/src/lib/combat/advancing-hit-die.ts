import { hitDieFace } from "@/lib/srd/srd.js";

// The one resolver both applyLevelUpOp and hitPointsStep route through, so served meta.averageGain matches committed HP by construction.
// No edition param — SRD 5.1 and SRD 5.2 read identically (PHB'14 p. 15 / PHB'24 p. 36).
export function advancingHitDie(
  entryHitDie: string | null | undefined,
  characterHitDie: string,
): { die: string; faces: number } {
  const die = entryHitDie ?? characterHitDie;
  return { die, faces: hitDieFace(die) };
}
