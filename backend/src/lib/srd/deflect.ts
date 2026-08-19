import type { RulesEdition } from "@character-sheet/shared-types";

import type { AnnounceAugmentor } from "@/lib/classes/announce-augmentors.js";
import type { EffectSpec } from "@/lib/combat/effects.js";

import { deriveMartialArtsDie } from "./weapon-damage.js";

/** A resolved dice roll — mirrors `EffectSpec.dice` / the frontend `RollSpec`. */
export interface DeflectRoll {
  count: number;
  faces: number;
  modifier: number;
}

/**
 * Deflect Attacks (SRD 5.2 / PHB'24 p.90, Monk L3) and Deflect Missiles
 * (SRD 5.1 / PHB'14 p.77, Monk L3) roll specs, resolved server-side so the
 * client never re-derives them (#1435) — the client reads the resolved spec
 * through `deflectRollFromAction`, retiring the former client-side
 * `deflectAttacksReductionRoll`/`deflectAttacksRedirectRoll`/
 * `deflectMissilesThrowRoll` roll builders.
 *
 * - `reduction` — the free base reduction: `1d10 + Dex modifier + monk level`.
 *   PHB'14 *Deflect Missiles* ("1d10 + your Dexterity modifier + your monk
 *   level") and SRD 5.2 *Deflect Attacks* ("1d10 plus your Dexterity modifier
 *   and Monk level") state the identical formula, so it is edition-invariant.
 * - `redirect` — the optional follow-up once a hit is reduced to 0, and the
 *   one axis that forks by edition:
 *     - SRD 5.2: a Dexterity SAVE against two Martial Arts die rolls + Dex
 *       modifier (`deriveMartialArtsDie`, monk-level-scaled).
 *     - SRD 5.1: a ranged ATTACK ROLL with the caught missile, standardized to
 *       `1d6 + Dex modifier` bludgeoning (this app has no per-ammo catch model).
 *
 * One function per rule; `edition` is the last parameter (mirrors
 * `subclassGateLevel`). `monkLevel` is the granting Monk entry's effective
 * level (`effectiveEntryLevel`), never the total character level — the caller
 * resolves that so this stays a pure arithmetic leaf.
 */
export function deriveDeflectSpec(
  monkLevel: number,
  dexMod: number,
  edition: RulesEdition,
): { reduction: DeflectRoll; redirect: DeflectRoll } {
  const reduction: DeflectRoll = { count: 1, faces: 10, modifier: dexMod + monkLevel };
  const redirect: DeflectRoll =
    edition === "EDITION_2014"
      ? { count: 1, faces: 6, modifier: dexMod }
      : { count: 2, faces: deriveMartialArtsDie(monkLevel, edition), modifier: dexMod };
  return { reduction, redirect };
}

// Wrap a resolved roll as a minimal EffectSpec — the same "utility kind
// carries dice" shape a maneuver's served effect uses (deriveManeuverEffect,
// lib/classes/maneuver-effect.ts), so the frontend reads `action.effect.dice`
// verbatim as its RollSpec.
function rollAsEffect(dice: DeflectRoll, effectType: EffectSpec["effectType"]): EffectSpec {
  return { effectType, dice, scaling: { mode: "none" } };
}

/**
 * Deflect Attacks (SRD 5.2 L3) / Deflect Missiles (SRD 5.1 L3) announce
 * augmentor (#1910): attaches the resolved reduction/redirect roll spec onto
 * the served row via the #1381 `effect` field, using the granting Monk
 * entry's OWN effective level (ctx.entryLevel — the per-entry fold in
 * deriveEntryScopedActions gives this for free, unlike the pre-#1910
 * withDeflectSpecs, which had to re-find the monk entry itself) and the
 * character's Dex modifier (ctx.abilityMods.dexterity). No-ops when
 * abilityMods is absent (the cast-guard callers, which never serve this
 * action key anyway) — see AugmentorContext's own doc comment.
 */
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

/** SRD 5.2 / PHB'24 p.89 — Deflect Energy's own grant level. */
export const DEFLECT_ENERGY_LEVEL = 13;

/**
 * Deflect Attacks' damage-type clause (#1505/#1912): "bludgeoning, piercing,
 * or slashing damage" below Deflect Energy (Monk L13), "any damage type"
 * from L13 on — SRD 5.1's Deflect Missiles carries no such clause at all, so
 * this descriptor targets only `deflectAttacks`. Unlike `deflectAugmentor`
 * above, this is the SOLE source of `damageTypeClause` — the deflectAttacks
 * row itself sets none — so `appliesTo` gates on edition alone (matching the
 * row's own L3 grant, not L13) and `augment` carries the L13 branch
 * internally, so it always resolves a clause once the row is granted at
 * all, exactly like the pre-#1912 DERIVED_ACTIONS function did.
 */
export const deflectEnergyAugmentor: AnnounceAugmentor = {
  targetKeys: ["deflectAttacks"],
  appliesTo: (ctx) => ctx.edition === "EDITION_2024",
  augment: (_action, ctx) => ({
    damageTypeClause: ctx.entryLevel >= DEFLECT_ENERGY_LEVEL ? "any damage type" : "bludgeoning, piercing, or slashing damage",
  }),
};
