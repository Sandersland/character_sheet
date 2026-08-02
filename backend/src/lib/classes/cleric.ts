import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition } from "./types.js";

// #1225: Cleric's feature TEXT moved to literal seed data
// (prisma/seed/cleric-features.ts, commit 1 of 3) — see that file's own
// header for the three-commit story. This module still carries its
// resourceFn (channelDivinity — commit 3 will move it onto its two carrier
// rows and delete this resourceFn) and its subclasses map (grantLevel only,
// PHB'14 p.57: Divine Domain is chosen at 1st level).
export const cleric: ClassDefinition = {
  resourceFn: (level, abilityScores, profBonus) => {
    if (level < 2) return [];
    const total = level >= 18 ? 3 : level >= 6 ? 2 : 1;
    const wisMod = abilityModifier(abilityScores.wisdom ?? 10);
    const turnDC = 8 + profBonus + wisMod;
    return [
      {
        key: "channelDivinity",
        label: "Channel Divinity",
        total,
        recharge: "short-or-long",
        description: `Channel divine energy for special effects (Turn Undead DC ${turnDC}, plus domain options). Regain all uses on a short or long rest.`,
      },
    ];
  },
  subclasses: {
    "life domain": { slug: "cleric-life-domain", grantLevel: 1 },
    "trickery domain": { slug: "cleric-trickery-domain", grantLevel: 1 },
  },
};
