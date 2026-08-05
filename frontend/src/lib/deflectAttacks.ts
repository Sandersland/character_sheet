/**
 * Deflect Attacks / Deflect Missiles (Monk L3, #1241/#1500/#1505) — pure
 * roll-spec and message helpers for the live-play reaction. No JSX; consumed
 * by useDeflectAttacksReaction's bespoke handleDeflectAttacks /
 * handleDeflectAttacksRedirect (the dynamic per-use 1d10 roll doesn't fit the
 * generic ACTION_RESOLVERS "kind" dispatch, so — like Parry/Riposte — it's
 * handled outside it).
 *
 * SRD 5.2 serves the `deflectAttacks` row (base reduction free; the optional
 * redirect spends 1 Focus and is a Dexterity SAVE the target makes). SRD 5.1
 * serves `deflectMissiles` instead — ranged-weapon-attacks only, no
 * damage-type clause to widen, and its redirect (`deflectMissilesThrow`,
 * spends 1 ki) is a ranged ATTACK ROLL with the caught missile, not a save.
 * A character is served exactly one of the two rows, never both
 * (DERIVED_ACTIONS' edition tags, actions.ts) — every helper below branches
 * on which one `character.availableActions` actually carries, never on a
 * level threshold (deleted #1505: `hasDeflectEnergy` re-derived the L13
 * Deflect Energy threshold client-side, which is now resolved server-side
 * onto the deflectAttacks row's `damageTypeClause`).
 *
 * The base reduction's scaling variable is "Monk level"
 * (`classEntryLevel(character, "monk")`), not total character level —
 * PHB'14 *Deflect Missiles* ("1d10 + your Dexterity modifier + your monk
 * level") and SRD 5.2 *Deflect Attacks* ("1d10 plus your Dexterity modifier
 * and Monk level") agree; the reduction formula is edition-invariant (#1441).
 */

import { abilityModifier, formatModifier } from "@/lib/abilities";
import type { RollResult, RollSpec } from "@/lib/dice";
import { classEntryLevel } from "@/lib/multiclass";
import type { AvailableAction, Character } from "@/types/character";

/** The served base-reduction row — `deflectAttacks` (SRD 5.2) or
 *  `deflectMissiles` (SRD 5.1), whichever the character actually has. */
export function deflectBaseAction(character: Character): AvailableAction | undefined {
  return character.availableActions?.find((a) => a.key === "deflectAttacks" || a.key === "deflectMissiles");
}

/**
 * Damage-type clause for the SRD 5.2 reaction message — resolved server-side
 * onto the `deflectAttacks` row's `damageTypeClause` (Deflect Energy widens
 * it from B/P/S to any damage type at monk L13, DERIVED_ACTIONS/actions.ts).
 * SRD 5.1's Deflect Missiles carries no such clause at all (ranged-weapon-
 * attacks-only; there is nothing to widen), so this is only ever read on the
 * deflectAttacks branch of formatDeflectAttacksMessage below.
 */
export function deflectAttacksDamageTypeClause(character: Character): string {
  return (
    character.availableActions?.find((a) => a.key === "deflectAttacks")?.damageTypeClause ??
    "bludgeoning, piercing, or slashing damage"
  );
}

/** 1d10 + Dex modifier + Monk level — the base reduction (Monk L3, edition-invariant). */
export function deflectAttacksReductionRoll(character: Character): RollSpec {
  const dexMod = abilityModifier(character.abilityScores.dexterity);
  return { count: 1, faces: 10, modifier: dexMod + classEntryLevel(character, "monk") };
}

/**
 * SRD 5.2 redirect: two Martial Arts die rolls + Dex modifier — the damage a
 * target must SAVE against when a ranged hit is reduced to 0. Die size is
 * read off the character's already-derived unarmedStrike (backend
 * deriveMartialArtsDie via serializeCharacter), never recomputed here.
 */
export function deflectAttacksRedirectRoll(character: Character): RollSpec {
  const dexMod = abilityModifier(character.abilityScores.dexterity);
  return { count: 2, faces: character.unarmedStrike.damage.faces, modifier: dexMod };
}

/**
 * SRD 5.1 throw-back: a ranged ATTACK ROLL (not a save) with the caught
 * missile, standardized to 1d6 bludgeoning + Dex modifier — this app has no
 * per-ammo-type catch model, so it mirrors the `deflectMissilesThrow`
 * DERIVED_ACTIONS reminder (actions.ts) verbatim rather than tracking which
 * specific missile was caught.
 */
export function deflectMissilesThrowRoll(character: Character): RollSpec {
  const dexMod = abilityModifier(character.abilityScores.dexterity);
  return { count: 1, faces: 6, modifier: dexMod };
}

/**
 * Toast text for the base reduction, once rolled. `action` is the served row
 * (deflectBaseAction) — its `name` labels the message and its `key` decides
 * which edition's flavor text/redirect hint applies.
 */
export function formatDeflectAttacksMessage(
  character: Character,
  action: AvailableAction,
  roll: RollResult,
  redirectAvailable: boolean,
): string {
  const dexMod = abilityModifier(character.abilityScores.dexterity);
  const monkLevel = classEntryLevel(character, "monk");
  const rolled = `1d10 rolled ${roll.dice[0].value} + DEX ${formatModifier(dexMod)} + monk level ${monkLevel}`;
  if (action.key === "deflectMissiles") {
    const base = `${action.name} — reduce ranged weapon attack damage by ${roll.total} (${rolled}).`;
    return redirectAvailable ? `${base} Caught it with a free hand? Spend 1 ki to throw it back.` : base;
  }
  const clause = deflectAttacksDamageTypeClause(character);
  const base = `${action.name} — reduce ${clause} by ${roll.total} (${rolled}).`;
  return redirectAvailable
    ? `${base} Reduced a ranged hit to 0 with a free hand? Spend 1 Focus to redirect.`
    : base;
}

/** Toast text for the SRD 5.2 redirect, once the Focus point is spent and the damage rolled. */
export function formatDeflectAttacksRedirectMessage(roll: RollResult): string {
  const dice = roll.dice.map((d) => d.value).join(" + ");
  return `Redirect — a creature within 60 ft must succeed on a Dexterity save or take ${roll.total} damage (${dice} + DEX ${formatModifier(roll.modifier)}).`;
}

/** Toast text for the SRD 5.1 throw-back, once the ki is spent and the attack damage rolled. */
export function formatDeflectMissilesThrowMessage(roll: RollResult): string {
  const dice = roll.dice.map((d) => d.value).join(" + ");
  return `Throw back — a ranged attack with the caught missile for ${roll.total} bludgeoning damage (${dice} + DEX ${formatModifier(roll.modifier)}) on a hit.`;
}
