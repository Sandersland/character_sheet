/**
 * Deflect Attacks / Deflect Energy (SRD 5.2, Monk L3/L13) — pure roll-spec and
 * message helpers for the live-play reaction (#1241). No JSX; consumed by
 * useTurnActions' bespoke handleDeflectAttacks / handleDeflectAttacksRedirect
 * (the dynamic per-use 1d10 roll doesn't fit the generic ACTION_RESOLVERS
 * "kind" dispatch, so — like Parry/Riposte — it's handled outside it).
 *
 * The base reduction is free (no persisted resource, mirrors the Warrior of Shadow
 * shadowStep reminder in actionResolvers.ts); only the optional redirect spends 1
 * Focus, via the deflectAttacksRedirect ACTION_EFFECT_FN entry. SRD 5.2 redirects
 * via a Dexterity saving throw the target makes (not an attack roll — verified
 * against the 2024 text; the 2014 Deflect Missiles redirect used an attack roll).
 */

import { abilityModifier, formatModifier } from "@/lib/abilities";
import type { RollResult, RollSpec } from "@/lib/dice";
import type { Character } from "@/types/character";

/** L13+: Deflect Energy widens Deflect Attacks from B/P/S to any damage type. */
export function hasDeflectEnergy(character: Character): boolean {
  return character.level >= 13;
}

/** Damage-type clause for the reaction message. */
export function deflectAttacksDamageTypeClause(character: Character): string {
  return hasDeflectEnergy(character) ? "any damage type" : "bludgeoning, piercing, or slashing damage";
}

/** 1d10 + Dex modifier + monk level — the Deflect Attacks reduction (SRD 5.2 L3). */
export function deflectAttacksReductionRoll(character: Character): RollSpec {
  const dexMod = abilityModifier(character.abilityScores.dexterity);
  return { count: 1, faces: 10, modifier: dexMod + character.level };
}

/**
 * Two Martial Arts die rolls + Dex modifier — the redirect damage a target must
 * save against when a ranged hit is reduced to 0. Die size is read off the
 * character's already-derived unarmedStrike (backend deriveMartialArtsDie via
 * serializeCharacter), never recomputed here — 5e rules tables stay backend-only.
 */
export function deflectAttacksRedirectRoll(character: Character): RollSpec {
  const dexMod = abilityModifier(character.abilityScores.dexterity);
  return { count: 2, faces: character.unarmedStrike.damage.faces, modifier: dexMod };
}

/** Toast text for the base reduction, once rolled. */
export function formatDeflectAttacksMessage(
  character: Character,
  roll: RollResult,
  redirectAvailable: boolean,
): string {
  const dexMod = abilityModifier(character.abilityScores.dexterity);
  const clause = deflectAttacksDamageTypeClause(character);
  const base = `Deflect Attacks — reduce ${clause} by ${roll.total} (1d10 rolled ${roll.dice[0].value} + DEX ${formatModifier(dexMod)} + monk level ${character.level}).`;
  return redirectAvailable
    ? `${base} Reduced a ranged hit to 0 with a free hand? Spend 1 Focus to redirect.`
    : base;
}

/** Toast text for the redirect, once the Focus point is spent and the damage rolled. */
export function formatDeflectAttacksRedirectMessage(roll: RollResult): string {
  const dice = roll.dice.map((d) => d.value).join(" + ");
  return `Redirect — a creature within 60 ft must succeed on a Dexterity save or take ${roll.total} damage (${dice} + DEX ${formatModifier(roll.modifier)}).`;
}
