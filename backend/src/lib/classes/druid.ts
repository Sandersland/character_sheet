import type { ClassDefinition } from "./types.js";

// EDITION_2014 Wild Shape still can't move onto a row, even after the
// pool-detail-fields task turned its CR cap and duration into structured
// `details` instead of interpolating them into the description. The blocker
// isn't that a row can't be subclass-scoped (Circle Forms below already is a
// subclass row) — it's two mechanics specific to how a BASE pool picks up a
// subclass's variant: (a) mergeLayers (registry.ts) is base-wins on pool
// keys, so a Circle of the Moon row declaring its own "wildShape" pool would
// be silently DROPPED, not overlaid, once a base row also claims that key;
// (b) the Moon curve (wildShapeCrCap below) works today only because
// deriveBaseLayer feeds the ACTIVE subclassKey into the base class's own
// resourceFn (#906) — row resolution (poolsFromRows) has no equivalent
// inbound-subclass parameter, so a row can't branch on "which subclass is
// active" the way this function does. #1226's EDITION_2024 row sidesteps
// both problems by taking a DIFFERENT rule instead of a new mechanism: SRD
// 5.2 states one subclass-invariant CR table in prose on the base row, and
// Circle of the Moon's own level/3 bump lives as plain feature TEXT on its
// Circle Forms row, never baked into the pool. EDITION_2014 can't take that
// same escape without a real regression: SRD 5.1's Moon druid genuinely gets
// a DIFFERENT computed cap than the base table, and flattening it to the base
// row's value would show every Moon druid's pool card the wrong Max CR.
export const druid: ClassDefinition = {
  resourceFn: (level, _abilityScores, _profBonus, subclassKey, edition) => {
    if (edition === "EDITION_2024") return [];
    if (level < 2) return [];
    const crCap = `${wildShapeCrCap(level, subclassKey)}${wildShapeSpeedNote(level)}`;
    const hours = Math.max(1, Math.floor(level / 2));
    return [
      {
        key: "wildShape",
        label: "Wild Shape",
        total: level >= 20 ? 99 : 2,
        recharge: "short-or-long",
        description: "Transform into a beast. Regain all uses on a short or long rest.",
        details: [
          { label: "Max CR", value: crCap },
          { label: "Duration", value: `${hours} hour(s)` },
          ...(level >= 20 ? [{ label: "Uses", value: "Unlimited (Archdruid)" }] : []),
        ],
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
