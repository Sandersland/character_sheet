import type { SpellCastCostKind } from "@character-sheet/shared-types";

// Edition-invariant: casting-time text is identical across SRD 5.1 and SRD 5.2.
// Must match the frontend's castCostBadge prefix boundaries.
// "1 action or 8 hours" (a ritual choice) resolves to "action" — the combat-relevant half; a pure ritual/minutes/hours time resolves to "other".
export function deriveSpellCastCost(castingTime: string): SpellCastCostKind {
  const t = castingTime.toLowerCase();
  if (t.startsWith("1 bonus action")) return "bonusAction";
  if (t.startsWith("1 reaction")) return "reaction";
  if (t.startsWith("1 action")) return "action";
  return "other";
}
