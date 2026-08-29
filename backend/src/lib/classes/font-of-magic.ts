// PHB'14 p.101 / SRD 5.2 p.140: Font of Magic's spell-slot cost table (level -> Sorcery Points) is identical in both editions — SRD 5.2 only adds a Min. Sorcerer Level gate, not a different cost.
const FONT_OF_MAGIC_SLOT_COSTS: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };

export const FONT_OF_MAGIC_MAX_SLOT_LEVEL = 5;

export function sorceryPointCostForSlot(slotLevel: number): number | null {
  return FONT_OF_MAGIC_SLOT_COSTS[slotLevel] ?? null;
}
