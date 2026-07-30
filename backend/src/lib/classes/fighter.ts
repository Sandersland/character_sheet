import type { RulesEdition } from "@character-sheet/shared-types";

import { abilityModifier } from "@/lib/srd/srd.js";

import type { ClassDefinition, DerivedResource } from "./types.js";

// Fighter's FEATURE TEXT is authored as literal seed data, not here
// (backend/prisma/seed/fighter-features.ts, #1227) — this module keeps only
// what stays code: resource pools (below, forked on `edition`) and Battle
// Master's bespoke ClassExtras (maneuverChoiceCount/SaveDC,
// toolProfChoiceCount — no tier array expresses a maneuver save DC that
// embeds ability-score math). `subclasses` below carries `slug`/`grantLevel`/
// `resourceFn`/`deriveExtras` only; `features` is intentionally absent on
// every entry (ClassDefinition.features / SubclassDefinition.features are
// optional, types.ts) since prisma/seed/class-features.ts no longer derives
// Fighter's rows from this file at all.

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

/** Second Wind's use count, EDITION_2024 only — 2/3/4 at L1/4/10 (SRD 5.2 p. 48). */
function secondWindTotal2024(level: number): number {
  if (level >= 10) return 4;
  if (level >= 4) return 3;
  return 2;
}

export const fighter: ClassDefinition = {
  resourceFn: (level, _abilityScores, _profBonus, _subclassKey, edition: RulesEdition) => {
    const pools: DerivedResource[] = [];
    // Second Wind is the FIRST consumer of #1221's partial short-rest-regain
    // shape: 2014 fully resets on either rest (SRD 5.1 p. 23); 2024 is a
    // longRest-recharge pool that additionally tops up by 1 on a short rest
    // (SRD 5.2 p. 48), which `shortRestRegain` exists to express.
    if (edition === "EDITION_2014") {
      pools.push({
        key: "secondWind",
        label: "Second Wind",
        total: 1,
        // LIVE BUG FIX (#1227): was "shortRest", which never recharged on a
        // long rest despite the feature's own description promising it.
        recharge: "short-or-long",
        description: `Bonus action: regain 1d10 + ${level} HP. Regain use on a short or long rest.`,
      });
    } else {
      const total = secondWindTotal2024(level);
      pools.push({
        key: "secondWind",
        label: "Second Wind",
        total,
        recharge: "longRest",
        shortRestRegain: 1,
        description: `Bonus action: regain 1d10 + ${level} HP. You have ${total} uses. Regain one expended use on a short rest, all on a long rest.`,
      });
    }
    if (level >= 2) {
      pools.push({
        key: "actionSurge",
        label: "Action Surge",
        total: level >= 17 ? 2 : 1,
        // LIVE BUG FIX (#1227), both editions: was "shortRest", which never
        // recharged on a long rest. SRD 5.1 p. 24 / SRD 5.2 p. 48 both read
        // "you can't do so again until you finish a Short or Long Rest" —
        // genuinely no edition fork here, unlike Second Wind.
        recharge: "short-or-long",
        description: "Take one additional action on your turn. Regain use(s) on a short or long rest.",
      });
    }
    if (level >= 9) {
      pools.push({
        key: "indomitable",
        label: "Indomitable",
        total: level >= 17 ? 3 : level >= 13 ? 2 : 1,
        recharge: "longRest",
        description: "Reroll a failed saving throw (must accept the new result). Regain use(s) on a long rest.",
      });
    }
    return pools;
  },
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
