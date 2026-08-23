import type { ClassDefinition } from "./types.js";

// EDITION_2014 Wild Shape's CR cap is a function of level AND subclassKey,
// and its duration interpolates level/2 inside the description — neither fits
// a ClassFeature row (poolFromRow reads only the row's own literal
// description), so this stays a resourceFn rather than moving onto a row
// like the 2024 version did.
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
    "circle of the moon": { slug: "druid-circle-of-the-moon", grantLevel: 2 },
  },
};

// PHB'14 p.66: Circle of the Moon's Circle Forms raise the Wild Shape CR cap
// to 1 at L2, then level/3 (min 1) from L6; other circles use the base table.
function wildShapeCrCap(level: number, subclassKey: string | undefined): string {
  if (subclassKey === "circle of the moon") {
    return String(level >= 6 ? Math.max(1, Math.floor(level / 3)) : 1);
  }
  return level >= 8 ? "1" : level >= 4 ? "1/2" : "1/4";
}

function wildShapeSpeedNote(level: number): string {
  return level >= 8 ? "" : level >= 4 ? " (no flying speed)" : " (no flying or swimming speed)";
}
