import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, DerivedResource } from "./types.js";

// #1230: Ranger's feature TEXT moved to literal seed data
// (prisma/seed/ranger-features.ts, commits 1-2); commit 3 (this one) moves
// Favored Enemy's resourceTotals pool onto its row and adds the ONE
// resourceFn below for Tireless/Nature's Veil (SRD 5.2 Wisdom-modifier
// formulas resourceTotals can't express — see ranger-features.ts's own
// header). This module is NOT deletable, for two independent reasons that
// both survive this commit:
//
// (1) Hunter's `choices` catalog (#899) below — the option-level generic
// "choose N" mechanism, owned by #1353 (see that issue's own comment for why
// the count gate can't yet go edition-aware).
//
// (2) The EDITION_2024 Wisdom-modifier resourceFn immediately below.
//
// `grantLevel: 3` is NOT one of the reasons — unlike Warlock/Wizard it
// already equals subclassGateLevel's undefined fallback, so it changes
// nothing were it omitted; seed-data.test.ts's grantLevel/subclassLevel
// match and the SUBCLASS_SLUGS bijection tests read `ranger.subclasses`
// regardless, but that alone wouldn't require this module — (1) and (2) do.
export const ranger: ClassDefinition = {
  // Tireless (L10) / Nature's Veil (L14), SRD 5.2: "a number of times equal
  // to your Wisdom modifier (minimum of once)" — identical clause on both
  // features, a formula no `resourceTotals` tier array can express. Both
  // rows (ranger-features.ts) declare resourceKey/resourceLabel/
  // resourceRecharge and deliberately OMIT resourceTotals; this supplies the
  // total. #416's C3 evaluator retires this, mirroring warlock.ts's Fiend
  // residue (Dark One's Own Luck). Returns nothing under EDITION_2014 (no
  // 2014 row declares either key) and nothing below each feature's own grant
  // level under 2024.
  resourceFn: (level, abilityScores, _profBonus, _subclassKey, edition) => {
    if (edition !== "EDITION_2024") return [];
    const wisMod = Math.max(1, abilityModifier(abilityScores.wisdom ?? 10));
    const pools: DerivedResource[] = [];
    if (level >= 10) {
      pools.push({
        key: "tireless",
        label: "Tireless",
        total: wisMod,
        recharge: "longRest",
        // #1528 no-second-string rule: this description MUST agree with the
        // EDITION_2024 Tireless row's own text (ranger-features.ts) — both
        // mention "Temporary Hit Points" and "Wisdom modifier" — asserted by
        // ranger-wisdom-pools.test.ts.
        description:
          "As a Magic action, you gain Temporary Hit Points equal to 1d8 plus your Wisdom modifier, and your Exhaustion level (if any) decreases by 1. You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest.",
      });
    }
    if (level >= 14) {
      pools.push({
        key: "naturesVeil",
        label: "Nature's Veil",
        total: wisMod,
        recharge: "longRest",
        description:
          "As a Bonus Action, you magically become Invisible until the end of your next turn. You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest.",
      });
    }
    return pools;
  },
  subclasses: {
    hunter: {
      slug: "ranger-hunter",
      grantLevel: 3,
      // Each Hunter tier is a "choose one" (#899): the option catalog lives as
      // GrantedAbility rows (source = catalogSource), the pick as
      // choicesKnown[key]. Byte-identical since before #1230 — deliberately:
      // SubclassChoice.count has no `edition` parameter, so tagging only the
      // option catalog (Giant Killer/Steel Will EDITION_2014-only, the
      // survivors forked) would still offer hunterMultiattack at L11 and
      // superiorHuntersDefense at L15 to a 2024 Hunter, then hand them an
      // EMPTY level-up picker once their own options were tagged away —
      // strictly worse than today's stale state. Deferred wholly to #1353
      // (comment posted there): the option-level half needs no new
      // mechanism, but it must land in the same commit as an edition-aware
      // `count`, and 2024 additionally makes both tiers swappable on a rest
      // (choicesKnown's permanent snapshot doesn't model that either).
      choices: [
        { key: "huntersPrey", label: "Hunter's Prey", catalogSource: "huntersPrey", count: (l) => (l >= 3 ? 1 : 0) },
        {
          key: "defensiveTactics",
          label: "Defensive Tactics",
          catalogSource: "defensiveTactics",
          count: (l) => (l >= 7 ? 1 : 0),
        },
        {
          key: "hunterMultiattack",
          label: "Multiattack",
          catalogSource: "hunterMultiattack",
          count: (l) => (l >= 11 ? 1 : 0),
        },
        {
          key: "superiorHuntersDefense",
          label: "Superior Hunter's Defense",
          catalogSource: "superiorHuntersDefense",
          count: (l) => (l >= 15 ? 1 : 0),
        },
      ],
    },
    "beast master": { slug: "ranger-beast-master", grantLevel: 3 },
  },
};
