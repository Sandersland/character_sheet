import type { ClassDefinition } from "./types.js";

// #1232: Sorcerer's feature TEXT moved to literal seed data
// (prisma/seed/sorcerer-features.ts, commits 1-2). This module is NOT
// deletable, unlike fighter.ts/barbarian.ts, for THREE reasons — see this
// file's own header, updated per commit, for the running inventory:
//
// (1) `grantLevel: 1` on both subclasses below is PHB'14 p.99's real
// Sorcerous Origin gate, not the 3 every SUBCLASS_IDENTITY-seeded,
// not-yet-deleted module falls back to (subclassGateLevel(undefined,
// "EDITION_2014") === 3) — deleting this module would silently move every
// 2014 Sorcerer's subclass gate to 3. #1576 tracks moving this gate onto
// data so this module can finally go.
//
// (2) `sorceryPoints`' total is `level` for every level 2-20 — a formula,
// not a level-tiered total ClassFeature.resourceTotals' tier-array schema
// can express (that column's own schema.prisma comment names exactly this
// case, alongside Bardic Inspiration/Lay on Hands, as the "stays in
// resourceFn" shape).
//
// (3) FONT_OF_MAGIC_MAX_SLOT_LEVEL/sorceryPointCostForSlot have a real
// consumer in lib/spellcasting/spellcasting.ts.

// Font of Magic "Creating Spell Slots" cost table (PHB p.101): slot level → SP cost.
// Sorcerers can create spell slots no higher than 5th level. Unchanged in
// SRD 5.2 (2024) — the cost-per-slot-level table itself is identical; only
// the Min. Sorcerer Level gating (2024-only, out of scope — #1232 follow-up
// 2) is missing from this table, not the costs themselves.
const FONT_OF_MAGIC_SLOT_COSTS: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };

export const FONT_OF_MAGIC_MAX_SLOT_LEVEL = 5;

// SP cost to create a slot of the given level, or null if outside the 1-5 table.
export function sorceryPointCostForSlot(slotLevel: number): number | null {
  return FONT_OF_MAGIC_SLOT_COSTS[slotLevel] ?? null;
}

export const sorcerer: ClassDefinition = {
  resourceFn: (level) => {
    if (level < 2) return [];
    return [
      {
        key: "sorceryPoints",
        label: "Sorcery Points",
        total: level,
        recharge: "longRest",
        description: "Convert to spell slots or fuel Metamagic options (Font of Magic). Regain all points on a long rest.",
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
      resourceFn: () => [
        {
          key: "tidesOfChaos",
          label: "Tides of Chaos",
          total: 1,
          recharge: "longRest",
          description: "Gain advantage on one attack roll, ability check, or saving throw. Regain use on a long rest (DM may trigger a Wild Magic Surge to restore it early).",
        },
      ],
    },
  },
};
