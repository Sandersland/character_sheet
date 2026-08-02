import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition } from "./types.js";

// #1226 (mirrors Barbarian's #1223 / Ranger's #1230 pilots): Druid's feature
// TEXT moved to literal seed data (prisma/seed/druid-features.ts, commits
// 1-2). This module is NOT deletable — for THREE independent reasons, unlike
// Ranger's two:
//
// (1) `grantLevel: 2` on both subclasses below (PHB'14 p.66) — the binding
// reason, identical in shape to Wizard's own module survival (#1234): even a
// fully row-driven `wildShape` could not delete this file while
// subclassGateLevel's undefined-grantLevel fallback is 3, because deleting it
// would silently move Druid's 2014 subclass gate from 2 to 3 (#1576).
//
// (2) The EDITION_2014 Wild Shape pool below (wildShapeCrCap +
// wildShapeSpeedNote), UNTOUCHED by commit 3: the CR cap is a function of
// level AND `subclassKey`, and the duration interpolates `level / 2` INSIDE
// the description — #1528's no-second-string rule means `poolFromRow` reads a
// row's own `description` verbatim, so a row can't express either axis. SRD
// 5.2 restructures Wild Shape enough to drop both — the computed CR moves to
// Circle of the Moon's own Circle Forms row as a flat `level / 3` formula
// stated in PROSE (druid-features.ts), and the static three-tier CR table + a
// flat "half your Druid level" duration clause both fit directly in the
// EDITION_2024 Wild Shape row's text — so the 2024 pool DOES qualify for
// `resourceTotals` and moves there (commit 3, below): `edition ===
// "EDITION_2024"` short-circuits to `[]` before any of this function's
// per-subclass logic runs, and mergePoolSources (registry.ts) has nothing to
// arbitrate since the 2024 row declares no resourceFn-colliding key. 2014
// keeps the unchanged SRD 5.1 rule (including the `level >= 20 ? 99`
// Archdruid branch and its "Unlimited uses (Archdruid)" sentence) exactly as
// it was before this issue.
//
// (3) Circle of the Moon's own Moonlight Step resourceFn (2024, below): a
// Wisdom-modifier formula resourceTotals can't express, mirroring Ranger's
// Tireless/Nature's Veil (#1230) and Warlock's Dark One's Own Luck residue.
export const druid: ClassDefinition = {
  resourceFn: (level, _abilityScores, _profBonus, subclassKey, edition) => {
    if (edition === "EDITION_2024") return [];
    if (level < 2) return [];
    const crCap = `${wildShapeCrCap(level, subclassKey)}${wildShapeSpeedNote(level)}`;
    return [
      {
        key: "wildShape",
        label: "Wild Shape",
        total: level >= 20 ? 99 : 2,
        recharge: "short-or-long",
        description: `Transform into a beast (max CR ${crCap}). Lasts up to ${Math.max(1, Math.floor(level / 2))} hour(s). Regain all uses on a short or long rest.${level >= 20 ? " Unlimited uses (Archdruid)." : ""}`,
      },
    ];
  },
  // PHB'14 p.66: Druid Circle (Druid's subclass) is chosen at 2nd level.
  subclasses: {
    "circle of the land": { slug: "druid-circle-of-the-land", grantLevel: 2 },
    "circle of the moon": {
      slug: "druid-circle-of-the-moon",
      grantLevel: 2,
      // Moonlight Step (SRD 5.2, mirror-sourced — see druid-features.ts's own
      // header): "a number of times equal to your Wisdom modifier (minimum of
      // once)", regained on a Long Rest — a formula no `resourceTotals` tier
      // array can express (reason (3) above). Absent under EDITION_2014
      // (Moonlight Step doesn't exist in SRD 5.1) and below its own L10 grant.
      resourceFn: (level, abilityScores, _profBonus, _subclassKey, edition) => {
        if (edition !== "EDITION_2024" || level < 10) return [];
        const wisMod = Math.max(1, abilityModifier(abilityScores.wisdom ?? 10));
        return [
          {
            key: "moonlightStep",
            label: "Moonlight Step",
            total: wisMod,
            recharge: "longRest",
            // #1528 no-second-string rule: this description MUST agree with
            // the EDITION_2024 Moonlight Step row's own text
            // (druid-features.ts) — both mention "Bonus Action", "30 feet"
            // and "Wisdom modifier".
            description:
              "As a Bonus Action, you teleport up to 30 feet to an unoccupied space you can see, and you have Advantage on the next attack roll you make before the end of this turn. You can use this feature a number of times equal to your Wisdom modifier (minimum of once), and you regain all expended uses when you finish a Long Rest. You can also regain one expended use by expending a spell slot of level 2 or higher (no action required).",
          },
        ];
      },
    },
  },
};

// Circle of the Moon's Circle Forms raise the Wild Shape CR cap: CR 1 from its
// L2 grant (PHB'14 p.66, the `grantLevel: 2` above — NOT 3, which is only
// subclassGateLevel's fallback for a subclass that declares none), then
// level÷3 (min 1) from L6. Other circles use the base druid table.
//
// EDITION_2014 only: resourceFn returns early for EDITION_2024, whose CR cap
// is prose on the Circle Forms row instead. Do not "simplify" this to the 2024
// level÷3 rule — it encodes SRD 5.1 and every 2014 Moon druid reads it (#1226).
function wildShapeCrCap(level: number, subclassKey: string | undefined): string {
  if (subclassKey === "circle of the moon") {
    return String(level >= 6 ? Math.max(1, Math.floor(level / 3)) : 1);
  }
  return level >= 8 ? "1" : level >= 4 ? "1/2" : "1/4";
}

// Base Wild Shape speed restrictions lift with level, regardless of subclass.
function wildShapeSpeedNote(level: number): string {
  return level >= 8 ? "" : level >= 4 ? " (no flying speed)" : " (no flying or swimming speed)";
}
