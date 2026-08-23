import type { ClassDefinition } from "./types.js";

// PHB p.101: Font of Magic "Creating Spell Slots" cost table, slot level -> SP cost.
const FONT_OF_MAGIC_SLOT_COSTS: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };

export const FONT_OF_MAGIC_MAX_SLOT_LEVEL = 5;

export function sorceryPointCostForSlot(slotLevel: number): number | null {
  return FONT_OF_MAGIC_SLOT_COSTS[slotLevel] ?? null;
}

export const sorcerer: ClassDefinition = {
  resourceFn: (level, _abilityScores, _profBonus, _subclassKey, edition) => {
    if (level < 2) return [];
    return [
      {
        key: "sorceryPoints",
        label: "Sorcery Points",
        total: level,
        recharge: "longRest",
        description:
          edition === "EDITION_2024"
            ? "Font of Magic: spend Sorcery Points to create spell slots — 2 SP for a level 1 slot (minimum Sorcerer level 2) up to 7 SP for a level 5 slot (minimum level 9) — or expend a spell slot to gain Sorcery Points equal to its level. A slot created this way vanishes on a Long Rest; regain all Sorcery Points on a Long Rest."
            : "Convert to spell slots or fuel Metamagic options (Font of Magic). Regain all points on a long rest.",
      },
    ];
  },
  // PHB'14 p.99: Sorcerous Origin (Sorcerer's subclass) is chosen at 1st level.
  subclasses: {
    "draconic bloodline": {
      slug: "sorcerer-draconic-bloodline",
      grantLevel: 1,
    },
    "wild magic": {
      slug: "sorcerer-wild-magic",
      grantLevel: 1,
    },
  },
};
