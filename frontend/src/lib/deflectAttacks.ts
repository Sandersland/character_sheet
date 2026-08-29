// SRD 5.2 serves the deflectAttacks row (base reduction free; the optional redirect spends 1 Focus and is a Dexterity SAVE the target makes). SRD 5.1 serves deflectMissiles instead — ranged-weapon-attacks only, no damage-type clause to widen, and its redirect (deflectMissilesThrow, spends 1 ki) is a ranged ATTACK ROLL with the caught missile, not a save. A character is served exactly one of the two rows, never both — every helper below branches on which one character.availableActions actually carries, never on a level threshold. The reduction/redirect roll specs are resolved server-side by deriveDeflectSpec; classEntryLevel is read here only for the "monk level N" display string in formatDeflectAttacksMessage.

import { abilityModifier, formatModifier } from "@/lib/abilities";
import type { RollResult, RollSpec } from "@/lib/dice";
import { classEntryLevel } from "@/lib/multiclass";
import type { AvailableAction, Character } from "@/types/character";

export function deflectBaseAction(character: Character): AvailableAction | undefined {
  return character.availableActions?.find((a) => a.key === "deflectAttacks" || a.key === "deflectMissiles");
}

// Resolved server-side onto the deflectAttacks row's damageTypeClause (Deflect Energy widens it from B/P/S to any damage type at monk L13); SRD 5.1's Deflect Missiles carries no such clause, so this is only ever read on the deflectAttacks branch of formatDeflectAttacksMessage below.
export function deflectAttacksDamageTypeClause(character: Character): string {
  return (
    character.availableActions?.find((a) => a.key === "deflectAttacks")?.damageTypeClause ??
    "bludgeoning, piercing, or slashing damage"
  );
}

// Both the base reduction and the redirect/throw-back specs are resolved server-side by deriveDeflectSpec and attached via buildAvailableActionsView, so the client never re-derives the monk-level or die-size math.
export function deflectRollFromAction(action: AvailableAction | undefined): RollSpec | undefined {
  const dice = action?.effect?.dice;
  return dice ? { count: dice.count, faces: dice.faces, modifier: dice.modifier ?? 0 } : undefined;
}

// spendLabel is the served spend-pool label ("Focus Points" / "Ki Points") the redirect-hint names, so the toast and the redirect button agree on the resource; only the message structure stays client-side.
export function formatDeflectAttacksMessage(
  character: Character,
  action: AvailableAction,
  roll: RollResult,
  redirectAvailable: boolean,
  spendLabel?: string,
): string {
  const dexMod = abilityModifier(character.abilityScores.dexterity);
  const monkLevel = classEntryLevel(character, "monk");
  const rolled = `1d10 rolled ${roll.dice[0].value} + DEX ${formatModifier(dexMod)} + monk level ${monkLevel}`;
  const spend = `1 ${spendLabel ?? "point"}`;
  if (action.key === "deflectMissiles") {
    const base = `${action.name} — reduce ranged weapon attack damage by ${roll.total} (${rolled}).`;
    return redirectAvailable ? `${base} Caught it with a free hand? Spend ${spend} to throw it back.` : base;
  }
  const clause = deflectAttacksDamageTypeClause(character);
  const base = `${action.name} — reduce ${clause} by ${roll.total} (${rolled}).`;
  return redirectAvailable
    ? `${base} Reduced a ranged hit to 0 with a free hand? Spend ${spend} to redirect.`
    : base;
}

export function formatDeflectAttacksRedirectMessage(roll: RollResult): string {
  const dice = roll.dice.map((d) => d.value).join(" + ");
  return `Redirect — a creature within 60 ft must succeed on a Dexterity save or take ${roll.total} damage (${dice} + DEX ${formatModifier(roll.modifier)}).`;
}

export function formatDeflectMissilesThrowMessage(roll: RollResult): string {
  const dice = roll.dice.map((d) => d.value).join(" + ");
  return `Throw back — a ranged attack with the caught missile for ${roll.total} bludgeoning damage (${dice} + DEX ${formatModifier(roll.modifier)}) on a hit.`;
}
