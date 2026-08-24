// PHB'14 p.101 / SRD 5.2 p.140: Font of Magic "Creating Spell Slots" cost
// table, slot level -> Sorcery Point cost — identical in both editions (SRD
// 5.2's added Min. Sorcerer Level column gates when a slot may be created,
// not what it costs).
const FONT_OF_MAGIC_SLOT_COSTS: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };

export const FONT_OF_MAGIC_MAX_SLOT_LEVEL = 5;

export function sorceryPointCostForSlot(slotLevel: number): number | null {
  return FONT_OF_MAGIC_SLOT_COSTS[slotLevel] ?? null;
}
