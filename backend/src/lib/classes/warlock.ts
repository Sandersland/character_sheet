import type { ClassDefinition } from "./types.js";

// #1233: Warlock's feature TEXT moved to literal seed data
// (prisma/seed/warlock-features.ts, commits 1-2) and every movable resource
// pool moved onto its row (commit 3). This module is NOT deletable, unlike
// fighter.ts/barbarian.ts (both deleted outright by their own retabs): each
// patron's PHB'14 subclass grant level is 1, not the 3 every
// SUBCLASS_IDENTITY-seeded, not-yet-deleted module falls back to
// (subclassGateLevel(undefined, "EDITION_2014") === 3) — see the PHB'14
// p.105 citation below. #1576 tracks moving this gate onto data so this
// module can finally go.
//
// The Fiend's 2024 Dark One's Own Luck pool (Charisma modifier, minimum of
// once) used to survive here as a formula resourceFn — #1685's
// `{ abilityMod, min }` tier now expresses it directly on the row
// (warlock-features.ts), so every pool this module used to derive has moved
// onto its rows outright and every resourceFn is deleted, not merely
// emptied.
export const warlock: ClassDefinition = {
  // PHB'14 p.105: Otherworldly Patron (Warlock's subclass) is chosen at 1st level.
  subclasses: {
    "the fiend": { slug: "warlock-the-fiend", grantLevel: 1 },
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
