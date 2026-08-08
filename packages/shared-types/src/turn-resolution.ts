// TurnResolution descriptor (epic #1827 Slice 1, #1828) — a normalized "thing
// you resolve on your turn," assembled ONLY from wire values the serializer
// already supplies: weapon attack bonus/damage spec/critRange (AttackRow +
// Character.critRange/attacksPerAction), spellAttackBonus/spellSaveDC/ability
// (the spellcasting view), and a spell's own attackType/saveAbility/
// effectRolls (SpellEntry, decorated by decorateSpellEffects). A weapon swing
// and every spell shape (attack roll / saving throw / auto-hit / no-roll)
// reduce to this one shape — see CLAUDE.md "rules logic is backend-owned":
// the future resolver (#1831) composes a TurnResolution by copying already-
// served fields, never by re-deriving a 5e rule.
//
// Deliberately excludes the design spec's illustrative `commit(rolls)`
// member: that's a FUNCTION supplied by the resolver hook (#1831) once the
// backend `resolveAction` transaction op exists (#1829) — this package holds
// only the descriptor's DATA contract, not a not-yet-built op union.

import type { AttackRollSpec } from "./attack-row.js";

/** Action-economy slot a resolution spends — the three slots the turn hub tracks. */
export type TurnResolutionCostKind = "action" | "bonusAction" | "reaction";

/**
 * How a spell's free-text `castingTime` classifies for action-economy
 * purposes — served per spell entry (character-serialize/serialize/
 * spellcasting.ts's decorateSpellEffects) so a resolution's `cost.kind` is a
 * served enum, never a client-side parse of "1 bonus action" text.
 * `"other"` covers rituals/minutes/hours castingTime — spells the in-combat
 * turn economy doesn't track.
 */
export type SpellCastCostKind = "action" | "bonusAction" | "reaction" | "other";

export interface TurnResolutionCost {
  kind: TurnResolutionCostKind;
  /** Extra Attack count (weapons only) — the served `Character.attacksPerAction`. */
  attacks?: number;
}

/** To-hit d20 parameters — present for a weapon swing or an attack-roll spell. */
export interface TurnResolutionToHit {
  bonus: number;
  critRange: number;
}

/** Saving-throw parameters announced to the DM — present for a save-shaped spell. */
export interface TurnResolutionSave {
  dc: number;
  ability: string;
}

/**
 * A resolved damage or healing roll, already-resolved dice (the served
 * `AttackRow.damageSpec` for a weapon, or the served `EffectRoll.roll` for
 * the spell's chosen slot level) — absent entirely for a no-roll utility
 * resolution (Druidcraft).
 */
export interface TurnResolutionEffect {
  spec: AttackRollSpec;
  kind: "damage" | "heal";
  /** Damage type — absent for a heal. */
  damageType?: string;
}

/**
 * TurnResolution — a normalized "thing you resolve on your turn" (epic
 * #1827). `toHit`/`save` are mutually exclusive by shape: a weapon swing or
 * an attack-roll spell (Fire Bolt) populates `toHit`; a saving-throw spell
 * (Sacred Flame) populates `save`; an auto-hit spell (Magic Missile) or a
 * no-roll utility spell (Druidcraft) populates neither. `effect` carries the
 * damage/heal roll and is absent for a no-roll resolution.
 */
export interface TurnResolution {
  source: string;
  cost: TurnResolutionCost;
  toHit?: TurnResolutionToHit;
  save?: TurnResolutionSave;
  effect?: TurnResolutionEffect;
}
