import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, DerivedResource } from "./types.js";

// #1233: Warlock's feature TEXT moved to literal seed data
// (prisma/seed/warlock-features.ts, commits 1-2) and every movable resource
// pool moved onto its row (commit 3, this one — see that file's own header
// for the pool-by-pool inventory). This module is NOT deletable, unlike
// fighter.ts/barbarian.ts (both deleted outright by their own retabs), for
// TWO reasons that both survive this commit:
//
// (1) Each patron's PHB'14 subclass grant level is 1, not the 3 every
// SUBCLASS_IDENTITY-seeded, not-yet-deleted module falls back to
// (subclassGateLevel(undefined, "EDITION_2014") === 3) — see the PHB'14
// p.105 citation below. #1576 tracks moving this gate onto data so this
// module can finally go.
//
// (2) The Fiend's 2024 Dark One's Own Luck pool sets its uses to the
// Charisma modifier (minimum of once) — a formula, not a level-tiered total,
// which `ClassFeature.resourceTotals`' `[{ minLevel, total }]` tier array
// cannot express (that column's own schema.prisma comment names exactly this
// shape, alongside Bardic Inspiration/Lay on Hands, as the "stays in
// resourceFn" case). Its 2024 row (warlock-features.ts) declares the pool's
// resourceKey/resourceLabel/resourceRecharge and deliberately omits
// resourceTotals; this resourceFn supplies the total. Every OTHER pool this
// module used to derive — the Fiend's 2014 Dark One's Own Luck/Hurl Through
// Hell, and all of the Archfey's/Great Old One's — was a flat, level-gated
// total, so all of those moved onto their rows outright and their resourceFns
// are deleted here, not merely emptied.
export const warlock: ClassDefinition = {
  // PHB'14 p.105: Otherworldly Patron (Warlock's subclass) is chosen at 1st level.
  subclasses: {
    "the fiend": {
      slug: "warlock-the-fiend",
      grantLevel: 1,
      // Edition-gated: returns nothing under EDITION_2014 (that edition's
      // Dark One's Own Luck is a flat 1, fully expressed by its row's own
      // resourceTotals — see poolsFromRows/mergePoolSources, registry.ts) and
      // nothing below level 6 (the feature's own grant level) under 2024.
      resourceFn: (level, abilityScores, _profBonus, _subclassKey, edition) => {
        if (edition !== "EDITION_2024" || level < 6) return [];
        const pools: DerivedResource[] = [
          {
            key: "darkOnesOwnLuck",
            label: "Dark One's Own Luck",
            total: Math.max(1, abilityModifier(abilityScores.charisma ?? 10)),
            recharge: "longRest",
            // #1528 no-second-string rule: this description MUST agree with
            // the 2024 ClassFeature row's own text (warlock-features.ts) —
            // both must mention "1d10" and "Charisma modifier", since this is
            // the one Warlock pool that still carries a hand-written string
            // (every other moved pool reads its row's description directly,
            // poolFromRow) — asserted by warlock-resource-pools.test.ts.
            description:
              "You can call on your fiendish patron to alter fate in your favor. When you make an ability check or a saving throw, add 1d10 to the roll after seeing it but before its effects occur. You can do this a number of times equal to your Charisma modifier (minimum of once), but no more than once per roll. Regain all expended uses when you finish a Long Rest.",
          },
        ];
        return pools;
      },
    },
    "the archfey": {
      slug: "warlock-the-archfey",
      grantLevel: 1,
    },
    "the great old one": {
      slug: "warlock-the-great-old-one",
      grantLevel: 1,
    },
  },
};
