import type { ClassDefinition } from "./types.js";

// #1230: Ranger's feature TEXT moved to literal seed data
// (prisma/seed/ranger-features.ts). This module is NOT deletable, unlike
// fighter.ts/barbarian.ts (both deleted outright by their own retabs), for
// two reasons:
//
// (1) Hunter's `choices` catalog (#899) below — the option-level generic
// "choose N" mechanism, owned by #1353 (see that issue's own comment for why
// the count gate can't yet go edition-aware).
//
// (2) seed-data.test.ts's grantLevel/subclassLevel match and the
// SUBCLASS_SLUGS bijection tests both read `ranger.subclasses` — unlike
// Warlock/Wizard, `grantLevel: 3` here is NOT itself a reason to keep this
// module: 3 already equals subclassGateLevel's undefined-grantLevel
// fallback, so it changes nothing were it omitted. It stays only because (1)
// already requires the module to exist.
export const ranger: ClassDefinition = {
  subclasses: {
    hunter: {
      slug: "ranger-hunter",
      grantLevel: 3,
      // Each Hunter tier is a "choose one" (#899): the option catalog lives as
      // GrantedAbility rows (source = catalogSource), the pick as choicesKnown[key].
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
