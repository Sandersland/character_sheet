import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, RechargeOn } from "./types.js";

// #1224: Bard's feature TEXT moved to literal seed data
// (prisma/seed/bard-features.ts, commits 1-2); commit 3 (this one) is a no-op
// for resourceFn — Bardic Inspiration's pool stays wholly in TS despite
// #1685's evaluator (see bard-features.ts's own RESOURCE POOL header block).
// Every field IS now individually row-expressible (Cha-modifier total as a
// formula tier, the die-size ladder as resourceDieTiers, the longRest-then-
// short-or-long shift as resourceRechargeTiers, and — since the pool-detail-
// fields task made `die`/`recharge` structured wire fields instead of
// interpolating them into the description — the description itself is now
// static too), but migrating this pool off resourceFn onto a row is left as a
// follow-up; nothing here forces it. This module is NOT deletable, for a
// reason that has nothing to do with the subclass gate — Bard is
// Ranger-shaped (lib/classes/ranger.ts), not Cleric-shaped: both
// `college of lore` and `college of valor` declare `grantLevel: 3`, which
// already equals subclassGateLevel's undefined fallback, so omitting either
// changes nothing about the 2014 gate. The resourceFn below is the ONLY
// reason this file survives.
//
// The resourceFn's own signature takes NO `edition` parameter: verified
// against BOTH SRDs (SRD 5.1's "Charisma modifier, a minimum of once", d6/d8/
// d10/d12 at L1/5/10/15, Long Rest recharge upgrading to short-or-long at
// Font of Inspiration; SRD 5.2 identical on every axis) — an edition-invariant
// rule per CLAUDE.md's no-fork-when-they-agree line. The description is
// static and edition-neutral for the same reason: the die size and rest type
// are already carried on `die`/`recharge` (rendered as separate chips by
// ResourcePoolRow.tsx), and 2014's "within 10 minutes" vs 2024's "within the
// next hour" duration claim is left out rather than guessed at.
export const bard: ClassDefinition = {
  resourceFn: (level, abilityScores) => {
    const chaMod = abilityModifier(abilityScores.charisma ?? 10);
    const total = Math.max(1, chaMod);
    const die = level >= 15 ? "d12" : level >= 10 ? "d10" : level >= 5 ? "d8" : "d6";
    const recharge: RechargeOn = level >= 5 ? "short-or-long" : "longRest";
    return [
      {
        key: "bardicInspiration",
        label: "Bardic Inspiration",
        total,
        die,
        recharge,
        description: "Bonus action: grant one creature within 60 ft a Bardic Inspiration die. They add it to one roll.",
      },
    ];
  },
  subclasses: {
    "college of lore": { slug: "bard-college-of-lore", grantLevel: 3 },
    "college of valor": { slug: "bard-college-of-valor", grantLevel: 3 },
  },
};
