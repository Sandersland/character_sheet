import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, RechargeOn } from "./types.js";

// #1224: Bard's feature TEXT moved to literal seed data
// (prisma/seed/bard-features.ts, commits 1-2); commit 3 (this one) is a no-op
// for resourceFn — Bardic Inspiration's pool stays wholly in TS despite
// #1685's evaluator (see bard-features.ts's own RESOURCE POOL header block):
// its Cha-modifier total IS now expressible as a formula tier, but a
// level-tiered recharge (`resourceRecharge` is a single scalar) and a
// level-conditional description (the die size and rest type are interpolated
// inline, #1528's no-second-string rule) each independently block it. This
// module is NOT deletable, for a reason that has nothing to do with the
// subclass gate — Bard is Ranger-shaped (lib/classes/ranger.ts), not
// Cleric-shaped: both `college of lore` and `college of valor` declare
// `grantLevel: 3`, which already equals subclassGateLevel's undefined
// fallback, so omitting either changes nothing about the 2014 gate. The
// resourceFn below is the ONLY reason this file survives.
//
// The resourceFn's own signature takes NO `edition` parameter: verified
// against BOTH SRDs (SRD 5.1's "Charisma modifier, a minimum of once", d6/d8/
// d10/d12 at L1/5/10/15, Long Rest recharge upgrading to short-or-long at
// Font of Inspiration; SRD 5.2 identical on every axis) — an edition-invariant
// rule per CLAUDE.md's no-fork-when-they-agree line. Its description string is
// deliberately edition-neutral ("They add it to one roll.", no duration
// claim) for the same reason: 2014 says "within 10 minutes", 2024 says
// "within the next hour", and a function with no `edition` parameter can't
// pick between them.
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
        description: `Bonus action: grant one creature within 60 ft a Bardic Inspiration ${die}. They add it to one roll. Regain all uses on ${level >= 5 ? "a short or long rest" : "a long rest"}.`,
      },
    ];
  },
  subclasses: {
    "college of lore": { slug: "bard-college-of-lore", grantLevel: 3 },
    "college of valor": { slug: "bard-college-of-valor", grantLevel: 3 },
  },
};
