import type { ClassDefinition } from "./types.js";

// #1225: Cleric's feature TEXT moved to literal seed data
// (prisma/seed/cleric-features.ts, commits 1-2) and the Channel Divinity
// resource pool moved onto its two carrier rows (commit 3, this one — see
// that file's own RESOURCE POOL header block for the pool-carrier detail).
// This module is NOT deletable, unlike fighter.ts/barbarian.ts (both deleted
// outright by their own retabs): Divine Domain (Cleric's subclass) is chosen
// at 1st level (PHB'14 p.57), but `subclassGateLevel`'s undefined-`grantLevel`
// fallback is 3 for 2014 (registry.ts, mirrors warlock.ts's/wizard.ts's own
// reasoning — see either file's own header) — `SUBCLASSES` is seeded
// identity-only (registry.ts) then overlaid by THIS module's `grantLevel: 1`,
// so deleting it would leave a level-1/2 2014 Cleric with a subclass NAME and
// ZERO subclass FEATURES. Tracked for removal by #1576. `cleric` therefore
// stays in `scripts/check-class-ts-migration.sh`'s `NOT_YET_MIGRATED`.
export const cleric: ClassDefinition = {
  subclasses: {
    "life domain": { slug: "cleric-life-domain", grantLevel: 1 },
    "trickery domain": { slug: "cleric-trickery-domain", grantLevel: 1 },
  },
};
