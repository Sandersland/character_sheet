/**
 * Deflect Attacks / Deflect Energy (Monk L3/L13) — pure roll-spec and message
 * helpers for the live-play reaction (#1241). No JSX; consumed by
 * useTurnActions' bespoke handleDeflectAttacks / handleDeflectAttacksRedirect
 * (the dynamic per-use 1d10 roll doesn't fit the generic ACTION_RESOLVERS
 * "kind" dispatch, so — like Parry/Riposte — it's handled outside it).
 *
 * The base reduction is free (no persisted resource, mirrors the Warrior of Shadow
 * shadowStep reminder in actionResolvers.ts); only the optional redirect spends 1
 * Focus, via the deflectAttacksRedirect ACTION_EFFECT_FN entry. SRD 5.2 redirects
 * via a Dexterity saving throw the target makes (not an attack roll — verified
 * against the 2024 text; the 2014 Deflect Missiles redirect used an attack roll).
 *
 * The scaling variable is "Monk level" (`classEntryLevel(character, "monk")`),
 * not total character level — PHB'14 *Deflect Missiles* ("1d10 + your
 * Dexterity modifier + your monk level") and SRD 5.2 *Deflect Attacks* ("1d10
 * plus your Dexterity modifier and Monk level") agree; the reduction formula
 * is edition-invariant (#1441).
 *
 * The L13 Deflect Energy threshold is SRD 5.2 only — PHB'14 has no Deflect
 * Energy at any level. `DERIVED_ACTIONS`/`deriveActions` (backend
 * lib/classes/actions.ts) carry no edition axis, so a 2014 Monk is currently
 * served this 2024-only feature regardless. Tracked on #1435 / #1313;
 * deliberately not forked here — rules-edition forks are backend-owned.
 */

import { abilityModifier, formatModifier } from "@/lib/abilities";
import type { RollResult, RollSpec } from "@/lib/dice";
import { classEntryLevel } from "@/lib/multiclass";
import type { Character } from "@/types/character";

/** L13+: Deflect Energy widens Deflect Attacks from B/P/S to any damage type. */
export function hasDeflectEnergy(character: Character): boolean {
  return classEntryLevel(character, "monk") >= 13;
}

/** Damage-type clause for the reaction message. */
export function deflectAttacksDamageTypeClause(character: Character): string {
  return hasDeflectEnergy(character) ? "any damage type" : "bludgeoning, piercing, or slashing damage";
}

/** 1d10 + Dex modifier + Monk level — the Deflect Attacks reduction (Monk L3). */
export function deflectAttacksReductionRoll(character: Character): RollSpec {
  const dexMod = abilityModifier(character.abilityScores.dexterity);
  return { count: 1, faces: 10, modifier: dexMod + classEntryLevel(character, "monk") };
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
  const monkLevel = classEntryLevel(character, "monk");
  const base = `Deflect Attacks — reduce ${clause} by ${roll.total} (1d10 rolled ${roll.dice[0].value} + DEX ${formatModifier(dexMod)} + monk level ${monkLevel}).`;
  return redirectAvailable
    ? `${base} Reduced a ranged hit to 0 with a free hand? Spend 1 Focus to redirect.`
    : base;
}

/** Toast text for the redirect, once the Focus point is spent and the damage rolled. */
export function formatDeflectAttacksRedirectMessage(roll: RollResult): string {
  const dice = roll.dice.map((d) => d.value).join(" + ");
  return `Redirect — a creature within 60 ft must succeed on a Dexterity save or take ${roll.total} damage (${dice} + DEX ${formatModifier(roll.modifier)}).`;
}
