import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition } from "./types.js";

// Fighter's FEATURE TEXT is authored as literal seed data, not here
// (backend/prisma/seed/fighter-features.ts, #1227). #1528 went further: the
// base Fighter's resource pools (Second Wind, Action Surge, Indomitable) are
// ALSO row-driven now — resourceKey/resourceTotals/resourceDieTiers/
// resourceRecharge columns on those same rows (poolsFromRows,
// class-feature-rows.ts) — so there is no top-level `resourceFn` here
// anymore; `ClassDefinition.resourceFn` being optional (types.ts) is what
// lets a class drop it entirely once every one of its pools has migrated.
//
// What stays code: Battle Master's `resourceFn` (superiority dice) and
// `deriveExtras` (maneuverChoiceCount/SaveDC, toolProfChoiceCount) — no
// tier array expresses a maneuver save DC that embeds ability-score math, or
// a maneuver-choice/tool-choice count with no pool of its own. `subclasses`
// below carries `slug`/`grantLevel`/`resourceFn`/`deriveExtras` only;
// `features` is intentionally absent on every entry (ClassDefinition.features
// / SubclassDefinition.features are optional, types.ts) since
// prisma/seed/class-features.ts no longer derives Fighter's rows from this
// file at all.

/** Superiority dice count by Fighter level (Battle Master). Edition-invariant (#1227). */
function battleMasterDiceCount(level: number): number {
  if (level >= 15) return 6;
  if (level >= 7) return 5;
  return 4;
}

/** Superiority die size by Fighter level (Battle Master). Edition-invariant (#1227). */
function battleMasterDieFace(level: number): string {
  if (level >= 18) return "d12";
  if (level >= 10) return "d10";
  return "d8";
}

/**
 * Number of artisan's-tool proficiency choices the Battle Master may make
 * via Student of War. Returns 1 at/above level 3 (when the subclass is
 * granted), 0 below. Modeled as a count (not a boolean) to stay parallel
 * with battleMasterManeuverCount for the level-reconciliation registry.
 */
function studentOfWarToolCount(level: number): number {
  return level >= 3 ? 1 : 0;
}

/** Maneuver choice count by Fighter level (Battle Master). Edition-invariant (#1227). */
function battleMasterManeuverCount(level: number): number {
  if (level >= 15) return 9;
  if (level >= 10) return 7;
  if (level >= 7) return 5;
  return 3;
}

export const fighter: ClassDefinition = {
  // No top-level resourceFn (#1528): Second Wind/Action Surge/Indomitable are
  // now populated on their own ClassFeature rows (resourceKey/resourceTotals/
  // resourceRecharge — prisma/seed/fighter-features.ts), read by
  // registry.ts's deriveBaseLayer via poolsFromRows. The #1221 partial
  // short-rest-regain shape (Second Wind's 2024 top-up) and the #1227
  // recharge-shape live bug fixes (both pools' "short-or-long", not merely
  // "shortRest") moved onto those rows' `resourceRecharge`/`resourceTotals`
  // tiers — see class-feature-rows.ts's ResourceTotalTier for where
  // shortRestRegain rides now.
  subclasses: {
    "battle master": {
      slug: "fighter-battle-master",
      grantLevel: 3,
      resourceFn: (level, abilityScores, profBonus) => {
        const count = battleMasterDiceCount(level);
        const die = battleMasterDieFace(level);
        const strMod = abilityModifier(abilityScores.strength ?? 10);
        const dexMod = abilityModifier(abilityScores.dexterity ?? 10);
        const mightMod = Math.max(strMod, dexMod);
        const saveDC = 8 + profBonus + mightMod;
        return [
          {
            key: "superiorityDice",
            label: "Superiority Dice",
            total: count,
            die,
            recharge: "short-or-long",
            description: `Spend to fuel maneuvers. Maneuver save DC ${saveDC}. Regain all on a short or long rest.`,
          },
        ];
      },
      deriveExtras: (level, abilityScores, profBonus) => {
        const strMod = abilityModifier(abilityScores.strength ?? 10);
        const dexMod = abilityModifier(abilityScores.dexterity ?? 10);
        return {
          maneuverChoiceCount: battleMasterManeuverCount(level),
          maneuverSaveDC: 8 + profBonus + Math.max(strMod, dexMod),
          toolProfChoiceCount: studentOfWarToolCount(level),
        };
      },
    },
    champion: { slug: "fighter-champion", grantLevel: 3 },
    "eldritch knight": { slug: "fighter-eldritch-knight", grantLevel: 3 },
  },
};
