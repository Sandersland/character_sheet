import type { ClassDefinition } from "./types.js";

// #1226 commit 1 of 3 (mirrors Barbarian's #1223 / Ranger's #1230 pilots):
// Druid's feature TEXT moved to literal seed data
// (prisma/seed/druid-features.ts) — this module's `features`/subclass
// `features` keys are gone, `resourceFn`/wildShapeCrCap/wildShapeSpeedNote/
// `subclasses` are UNTOUCHED (zero behaviour change). This module is NOT
// deletable — for THREE independent reasons, unlike Ranger's two (full
// account, including why the Wild Shape pool itself later SPLITS by edition,
// lives in this file's commit-3 revision):
//
// (1) `grantLevel: 2` on both subclasses below (PHB'14 p.66) — the binding
// reason, identical in shape to Wizard's own module survival (#1234): even a
// fully row-driven `wildShape` could not delete this file while
// subclassGateLevel's undefined-grantLevel fallback is 3, because deleting it
// would silently move Druid's 2014 subclass gate from 2 to 3 (#1576).
//
// (2) The Wild Shape pool below (wildShapeCrCap + wildShapeSpeedNote): the CR
// cap is a function of level AND `subclassKey`, and the duration interpolates
// `level / 2` INSIDE the description — #1528's no-second-string rule means
// `poolFromRow` reads a row's own `description` verbatim, so a row can't
// express either axis. Re-evaluated at commit 3 once the 2024 text is
// authored (see that commit for the outcome — it splits by edition rather
// than staying uniformly in this function).
//
// (3) Circle of the Moon's own resourceFn residue, added at commit 3.
export const druid: ClassDefinition = {
  resourceFn: (level, _abilityScores, _profBonus, subclassKey) => {
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
    "circle of the moon": { slug: "druid-circle-of-the-moon", grantLevel: 2 },
  },
};

// Circle of the Moon's Circle Forms raise the Wild Shape CR cap: CR 1 at its L3
// grant, then level÷3 (min 1) from L6. Other circles use the base druid table.
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
