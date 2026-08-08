import type { SpellCastCostKind } from "@character-sheet/shared-types";

/**
 * Classifies a spell's free-text `castingTime` into the action-economy
 * category a served TurnResolution's `cost.kind` needs (epic #1827 Slice 1,
 * #1828) — the same "1 bonus action"/"1 reaction" prefix boundaries the
 * frontend's castCostBadge (spellPicker.ts) already renders as a badge,
 * promoted server-side so a later resolver adapter reads a served enum
 * instead of re-parsing text (CLAUDE.md: rules logic is backend-owned, no
 * exception). Edition-invariant: casting-time text is identical across SRD
 * 5.1 and SRD 5.2. "1 action or 8 hours" (a ritual choice) resolves to
 * "action" — the combat-relevant half; a pure ritual/minutes/hours casting
 * time the turn economy never tracks resolves to "other".
 */
export function deriveSpellCastCost(castingTime: string): SpellCastCostKind {
  const t = castingTime.toLowerCase();
  if (t.startsWith("1 bonus action")) return "bonusAction";
  if (t.startsWith("1 reaction")) return "reaction";
  if (t.startsWith("1 action")) return "action";
  return "other";
}
