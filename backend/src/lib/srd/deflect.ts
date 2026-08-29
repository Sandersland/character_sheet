import type { RulesEdition } from "@character-sheet/shared-types";

import type { AnnounceAugmentor } from "@/lib/classes/announce-augmentors.js";
import type { EffectSpec } from "@/lib/combat/effects.js";

import { deriveMartialArtsDie } from "./weapon-damage.js";

// Mirrors `EffectSpec.dice` / the frontend `RollSpec`.
export interface DeflectRoll {
  count: number;
  faces: number;
  modifier: number;
}

// Deflect Attacks (SRD 5.2 / PHB'24 p.90) and Deflect Missiles (SRD 5.1 / PHB'14 p.77), Monk L3. `reduction`: 1d10 + Dex + monk level (edition-invariant).
// `redirect`: SRD 5.2 is a Dex save vs 2x Martial Arts die + Dex (deriveMartialArtsDie); SRD 5.1 is a ranged attack roll, standardized here to 1d6 + Dex bludgeoning (no per-ammo catch model, #1435).
// `monkLevel` is the granting entry's effective level, not total character level.
export function deriveDeflectSpec(
  monkLevel: number,
  dexMod: number,
  edition: RulesEdition,
): { reduction: DeflectRoll; redirect: DeflectRoll } {
  const reduction: DeflectRoll = { count: 1, faces: 10, modifier: dexMod + monkLevel };
  let redirect: DeflectRoll;
  switch (edition) {
    case "EDITION_2014":
      redirect = { count: 1, faces: 6, modifier: dexMod };
      break;
    case "EDITION_2024":
      redirect = { count: 2, faces: deriveMartialArtsDie(monkLevel, edition), modifier: dexMod };
      break;
    default: {
      const exhaustive: never = edition;
      throw new Error(`deriveDeflectSpec: unhandled edition ${String(exhaustive)}`);
    }
  }
  return { reduction, redirect };
}

// Same shape as deriveManeuverEffect's served effect — the frontend reads `action.effect.dice` verbatim as its RollSpec.
function rollAsEffect(dice: DeflectRoll, effectType: EffectSpec["effectType"]): EffectSpec {
  return { effectType, dice, scaling: { mode: "none" } };
}

// Attaches the resolved reduction/redirect roll spec via the #1381 `effect` field. No-ops when abilityMods is absent (cast-guard callers never serve this action key).
export const deflectAugmentor: AnnounceAugmentor = {
  targetKeys: ["deflectAttacks", "deflectMissiles", "deflectAttacksRedirect", "deflectMissilesThrow"],
  appliesTo: (ctx) => ctx.abilityMods !== undefined,
  augment: (action, ctx) => {
    if (!ctx.abilityMods) return null;
    const dexMod = ctx.abilityMods.dexterity ?? 0;
    const { reduction, redirect } = deriveDeflectSpec(ctx.entryLevel, dexMod, ctx.edition);
    if (action.key === "deflectAttacks" || action.key === "deflectMissiles") {
      return { effect: rollAsEffect(reduction, "utility") };
    }
    if (action.key === "deflectAttacksRedirect" || action.key === "deflectMissilesThrow") {
      return { effect: rollAsEffect(redirect, "damage") };
    }
    return null;
  },
};

// SRD 5.2 / PHB'24 p.89 — Deflect Energy's own grant level.
export const DEFLECT_ENERGY_LEVEL = 13;

// SRD 5.2 / PHB'24 p.89 — SRD 5.1's Deflect Missiles carries no damage-type clause.
function editionHasDeflectEnergy(edition: RulesEdition): boolean {
  switch (edition) {
    case "EDITION_2024":
      return true;
    case "EDITION_2014":
      return false;
    default: {
      const exhaustive: never = edition;
      throw new Error(`editionHasDeflectEnergy: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// Deflect Attacks' damage-type clause (SRD 5.2 only — SRD 5.1's Deflect Missiles has none): "bludgeoning, piercing, or slashing damage" below Deflect Energy (Monk L13), "any damage type" from L13 on.
// This is the sole source of damageTypeClause, so appliesTo gates on edition alone (not level) and augment carries the L13 branch internally.
export const deflectEnergyAugmentor: AnnounceAugmentor = {
  targetKeys: ["deflectAttacks"],
  appliesTo: (ctx) => editionHasDeflectEnergy(ctx.edition),
  augment: (_action, ctx) => ({
    damageTypeClause: ctx.entryLevel >= DEFLECT_ENERGY_LEVEL ? "any damage type" : "bludgeoning, piercing, or slashing damage",
  }),
};
