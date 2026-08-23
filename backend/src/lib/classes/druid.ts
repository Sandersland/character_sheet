import type { ClassDefinition } from "./types.js";

// #1226 (mirrors Barbarian's #1223 / Ranger's #1230 pilots): Druid's feature
// TEXT moved to literal seed data (prisma/seed/druid-features.ts, commits
// 1-2). This module is NOT deletable — for ONE binding reason plus a RETIRED
// one:
//
// BINDING REASON: the EDITION_2014 Wild Shape pool below (wildShapeCrCap +
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
// RETIRED REASON: `grantLevel: 2` on both subclasses below (PHB'14 p.66) used
// to be a SECOND, independent reason — identical in shape to Cleric's/
// Warlock's/Wizard's own former module survival (all three deleted outright,
// #1576): even a fully row-driven `wildShape` could not have deleted this
// file while subclassGateLevel's undefined-grantLevel fallback was 3, because
// deleting it would have silently moved Druid's 2014 subclass gate from 2 to
// 3. #1576's seeded CharacterClass.subclassLevel is now live and gives
// isSubclassActive a data source that survives a module's deletion
// (ClassFeatureRowsCarrier.subclassLevel's own doc comment has the
// mechanism), so this reason alone no longer blocks deleting this file — it
// stays open only for the BINDING REASON above.
//
// Circle of the Moon's own Moonlight Step resourceFn (2024) used to be a
// THIRD reason — a Wisdom-modifier formula resourceTotals couldn't express,
// mirroring Ranger's Tireless/Nature's Veil (#1230) and Warlock's former Dark
// One's Own Luck residue — but #1685's `{ abilityMod, min }` tier now
// expresses it directly on the row (druid-features.ts), so that resourceFn is
// deleted.
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
