import type { ClassDefinition } from "./types.js";

// #1230: Ranger's feature TEXT moved to literal seed data
// (prisma/seed/ranger-features.ts, commits 1-2); commit 3 moved Favored
// Enemy's resourceTotals pool onto its row. Tireless/Nature's Veil (SRD 5.2
// Wisdom-modifier formulas) used to survive here as a small EDITION_2024
// resourceFn — #1685's `{ abilityMod, min }` tier now expresses both
// directly on their rows, so this module keeps exactly ONE reason to survive:
// Hunter's `choices` catalog (#899) below — the option-level generic
// "choose N" mechanism, owned by #1353 (see that issue's own comment for why
// the count gate can't yet go edition-aware).
//
// `grantLevel: 3` is NOT a reason — unlike Warlock/Wizard it already equals
// subclassGateLevel's undefined fallback, so it changes nothing were it
// omitted; seed-data.test.ts's grantLevel/subclassLevel match and the
// SUBCLASS_SLUGS bijection tests read `ranger.subclasses` regardless, but
// that alone wouldn't require this module.
export const ranger: ClassDefinition = {
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
