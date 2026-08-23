import type { ClassDefinition } from "./types.js";

// #1232: Sorcerer's feature TEXT moved to literal seed data
// (prisma/seed/sorcerer-features.ts, commits 1-2) and every movable resource
// pool moved onto its row (commit 3, this one — see that file's own header
// for the pool-by-pool inventory). This module is NOT deletable, unlike
// fighter.ts/barbarian.ts, for TWO reasons that survive this commit:
//
// (1) BINDING REASON: `sorceryPoints`' total is `level` for every level 2-20
// — a formula, not a level-tiered total ClassFeature.resourceTotals'
// tier-array schema can express (that column's own schema.prisma comment
// names exactly this case, alongside Bardic Inspiration/Lay on Hands, as the
// "stays in resourceFn" shape). Only its DESCRIPTION is edition-branched
// below — the 2024 Font of Magic ClassFeature row now also carries its own
// feature text (sorcerer-features.ts), and the two editions' Font of Magic
// text genuinely differs (SRD 5.2's Creating Spell Slots table adds a Min.
// Sorcerer Level column) — pinned agreeing with that row's own text by
// sorcerer-resource-pools.test.ts, mirroring warlock.ts's former Dark One's
// Own Luck residue (warlock.ts is deleted outright now, #1576).
//
// (2) FONT_OF_MAGIC_MAX_SLOT_LEVEL/sorceryPointCostForSlot have a real
// consumer in lib/spellcasting/spellcasting.ts.
//
// RETIRED REASON: `grantLevel: 1` on both subclasses below is PHB'14 p.99's
// real Sorcerous Origin gate, not the 3 every SUBCLASS_IDENTITY-seeded module
// falls back to — this used to be a THIRD, independent reason blocking
// deletion, identical in shape to Cleric's/Warlock's/Wizard's own (all three
// deleted outright, #1576). #1576's seeded CharacterClass.subclassLevel is
// now live and gives isSubclassActive a data source that survives a module's
// deletion (ClassFeatureRowsCarrier.subclassLevel's own doc comment has the
// mechanism), so this reason alone no longer blocks deleting this file — it
// stays open only for reasons (1)/(2) above.
//
// The wild-magic subclass's OWN resourceFn (tidesOfChaos) is DELETED here,
// not merely emptied — its flat, level-gated total moved onto both editions'
// Tides of Chaos rows (sorcerer-features.ts). mergePoolSources (registry.ts)
// lets a resourceFn pool WIN over a row pool of the same key, so leaving this
// fn in place would have made the new row columns permanently inert.

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
  resourceFn: (level, _abilityScores, _profBonus, _subclassKey, edition) => {
    if (level < 2) return [];
    return [
      {
        key: "sorceryPoints",
        label: "Sorcery Points",
        total: level,
        recharge: "longRest",
        // Total stays edition-invariant (`level`, both editions) — only the
        // description branches, per this file's own header comment above.
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
