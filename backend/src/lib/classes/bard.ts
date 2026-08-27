import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, RechargeOn } from "./types.js";

// This resourceFn is the only reason the module survives: both subclasses
// declare grantLevel 3, which already equals subclassGateLevel's undefined
// fallback, so the subclass entries alone would change nothing. Every pool
// field is now individually row-expressible (Cha-modifier total as a formula
// tier, the die ladder as resourceDieTiers, the recharge shift as
// resourceRechargeTiers, and a static description); migrating onto a row is a
// deliberate follow-up, not forced by anything here.
//
// No `edition` parameter: verified edition-invariant against both SRDs
// (SRD 5.1 "Charisma modifier, a minimum of once", d6/d8/d10/d12 at
// L1/5/10/15, Long Rest recharge upgrading to short-or-long at Font of
// Inspiration; SRD 5.2 identical on every axis). The description is
// edition-neutral for the same reason: die size and rest type ride the
// structured `die`/`recharge` fields, and 2014's "within 10 minutes" vs
// 2024's "within the next hour" duration is left out rather than guessed at.
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
