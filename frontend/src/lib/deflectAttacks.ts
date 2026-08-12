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
 * The reduction/redirect roll specs are resolved server-side
 * (`deriveDeflectSpec`, #1435); `classEntryLevel` is read here only for the
 * "monk level N" display string in formatDeflectAttacksMessage.
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

/**
 * The resolved roll spec off a served action row's `effect.dice` (#1435) — the
 * base reduction (`1d10 + Dex + monk level`) on the deflectAttacks/
 * deflectMissiles row, or the redirect/throw-back (`2×MA die + Dex` in SRD 5.2,
 * `1d6 + Dex` in SRD 5.1) on the redirect row. Both are resolved server-side by
 * `deriveDeflectSpec` (backend lib/srd/deflect.ts) and attached via
 * buildAvailableActionsView, so the client never re-derives the monk-level or
 * die-size math. Undefined until the row (and its spec) is served.
 */
export function deflectRollFromAction(action: AvailableAction | undefined): RollSpec | undefined {
  const dice = action?.effect?.dice;
  return dice ? { count: dice.count, faces: dice.faces, modifier: dice.modifier ?? 0 } : undefined;
}

/**
 * Toast text for the base reduction, once rolled. `action` is the served row
 * (deflectBaseAction) — its `name` labels the message and its `key` decides
 * which edition's flavor text/redirect hint applies. `spendLabel` is the served
 * spend-pool label ("Focus Points" / "Ki Points") the redirect-hint names, so
 * the toast and the redirect button agree on the resource; only the message
 * STRUCTURE stays client-side (#1435). Falls back to "point" when unserved.
 */
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
