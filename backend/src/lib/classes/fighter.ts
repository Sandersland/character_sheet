import type { ClassDefinition } from "./types.js";

// Fighter's FEATURE TEXT is authored as literal seed data, not here
// (backend/prisma/seed/fighter-features.ts, #1227). #1528 moved the base
// Fighter's resource pools (Second Wind, Action Surge, Indomitable) onto
// those same rows' resourceKey/resourceTotals/resourceDieTiers/
// resourceRecharge columns (poolsFromRows, class-feature-rows.ts). #1546 Part
// B finished the job: Battle Master's superiority-dice pool (resourceKey/
// resourceTotals/resourceDieTiers on the Combat Superiority row), its
// maneuverChoiceCount/toolProfChoiceCount (derivedStat/derivedStatTiers on
// Combat Superiority/Student of War), and its maneuverSaveDC
// (saveDcAbilities + lib/srd/announced-save-dc.ts) are ALL row-driven now —
// see registry.ts's deriveRowExtras for the class-agnostic reader that
// replaced this file's old `resourceFn`/`deriveExtras`.
//
// What's left below is pure registration: `slug` + `grantLevel` per
// subclass, nothing else. #1546 Part A (SUBCLASS_IDENTITY-seeded
// registry.ts) already made this registration redundant for every subclass
// gated at level 3 in both editions — Champion/Battle Master/Eldritch Knight
// all are — so this file has nothing left that #1532 can't delete outright.
export const fighter: ClassDefinition = {
  subclasses: {
    "battle master": { slug: "fighter-battle-master", grantLevel: 3 },
    champion: { slug: "fighter-champion", grantLevel: 3 },
    "eldritch knight": { slug: "fighter-eldritch-knight", grantLevel: 3 },
  },
};
