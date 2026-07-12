/**
 * Pure 5e turn-economy rules — no JSX, no side effects.
 *
 * Per-class action lists are derived from class/level rather than persisted
 * (derive-don't-persist pattern, same as level/profBonus). Extra Attack counts
 * are derived server-side and read off `character.attacksPerAction`.
 *
 * ⚑ MOVEMENT is intentionally excluded from this module. Speed / difficult-terrain
 * tracking is flagged for a future phase.
 */

import type { ActionCost, FightingStyleKey } from "@/types/character";

// ── Two-Weapon Fighting eligibility ──────────────────────────────────────────

/**
 * Returns true when the character's equipped loadout allows a TWF bonus-action
 * off-hand attack: at least two weapons equipped, both of which are light
 * (light property = true on the weapon detail). The off-hand attack's damage
 * omits the ability modifier unless the character has the Two-Weapon Fighting
 * style — resolved from `weapon.damage.abilityModifier` in `buildOffHandEntry`.
 *
 * The **Two-Weapon Fighting fighting style** (PHB p.72) removes the light
 * restriction, so when `fightingStyle === "twoWeaponFighting"` any two equipped
 * weapons qualify. (The paper-doll already prevents equipping a two-handed
 * weapon alongside an off-hand, so we don't re-check that here.)
 *
 * The existing `offHandBusy` field on the serialized character covers the
 * versatile-grip calculation but is a boolean that conflates "shield equipped"
 * and "two weapons equipped." We re-derive from inventory here because we need
 * the distinction: two light weapons → TWF affordance; one weapon + shield → no TWF.
 */
export function canTwoWeaponFight(
  inventory: Array<{ equipped: boolean; category: string; weapon?: { light: boolean } | null }>,
  fightingStyle?: FightingStyleKey | null,
): boolean {
  const equippedWeapons = inventory.filter(
    (i) => i.equipped && i.category === "weapon" && i.weapon,
  );
  if (equippedWeapons.length < 2) return false;
  // The Two-Weapon Fighting style removes the light-weapon restriction.
  if (fightingStyle === "twoWeaponFighting") return true;
  // Baseline: both held weapons must have the light property.
  return equippedWeapons.slice(0, 2).every((i) => i.weapon?.light === true);
}

// ── Universal action list ─────────────────────────────────────────────────────

export interface TurnActionOption {
  key: string;
  label: string;
  cost: ActionCost;
  description: string;
}

/**
 * Static list of universal 5e actions available to every character regardless
 * of class. These consume the action-economy slot locally (ephemeral) but make
 * NO server call and write NOTHING to the activity log.
 *
 * Reference: PHB "Actions in Combat" (Roll20 SRD equivalent).
 */
export const UNIVERSAL_ACTIONS: TurnActionOption[] = [
  {
    key: "attack",
    label: "Attack",
    cost: "action",
    description:
      "Make one or more weapon attacks (number determined by Extra Attack feature). Includes unarmed strikes and improvised weapons.",
  },
  {
    key: "castSpell",
    label: "Cast a Spell",
    cost: "action",
    description:
      "Cast a spell with a casting time of 1 action. Opens the spell picker to choose a spell, upcast slot, and target.",
  },
  {
    key: "castSpellBonus",
    label: "Cast a Spell (Bonus Action)",
    cost: "bonusAction",
    description:
      "Cast a spell with a casting time of 1 bonus action (e.g. Healing Word, Misty Step, Mass Healing Word). Opens the spell picker filtered to bonus-action spells.",
  },
  {
    key: "dodge",
    label: "Dodge",
    cost: "action",
    description:
      "Until the start of your next turn, any attack roll against you has disadvantage (if you can see the attacker) and you have advantage on Dexterity saving throws.",
  },
  {
    key: "dash",
    label: "Dash",
    cost: "action",
    description:
      "Gain extra movement equal to your speed for this turn. ⚑ Movement is not tracked by this app yet.",
  },
  {
    key: "disengage",
    label: "Disengage",
    cost: "action",
    description: "Your movement doesn't provoke opportunity attacks for the rest of this turn.",
  },
  {
    key: "help",
    label: "Help",
    cost: "action",
    description:
      "Lend aid to another: give an ally advantage on their next ability check, or distract an enemy so an adjacent ally has advantage on their next attack roll against it.",
  },
  {
    key: "hide",
    label: "Hide",
    cost: "action",
    description:
      "Attempt to hide (Dexterity Stealth check vs. passive Perception). You must be heavily obscured or otherwise out of sight.",
  },
  {
    key: "search",
    label: "Search",
    cost: "action",
    description: "Devote attention to finding something — a Perception or Investigation check.",
  },
  {
    key: "ready",
    label: "Ready",
    cost: "action",
    description:
      "Choose a trigger and a reaction to take when that trigger occurs before the start of your next turn. Spells that require concentration must still use concentration.",
  },
  {
    key: "useObject",
    label: "Use Object",
    cost: "action",
    description:
      "Interact with an object that requires more effort than a free interaction (e.g. drink a potion, use a magic item, activate a device).",
  },
  {
    key: "grapple",
    label: "Grapple",
    cost: "action",
    description:
      "Attempt to grapple a creature (Athletics vs. Athletics/Acrobatics). Uses one of your attack-action attacks if you have Extra Attack.",
  },
  {
    key: "shove",
    label: "Shove",
    cost: "action",
    description:
      "Shove a creature prone or push it 5 feet away (Athletics vs. Athletics/Acrobatics). Uses one of your attack-action attacks if you have Extra Attack.",
  },
  {
    key: "opportunityAttack",
    label: "Opportunity Attack",
    cost: "reaction",
    description:
      "When a creature within reach moves out of your reach without Disengaging, you may make one melee weapon attack against it as a reaction.",
  },
  {
    key: "castSpellReaction",
    label: "Cast Spell (Reaction)",
    cost: "reaction",
    description:
      "Cast a spell with a casting time of 1 reaction (e.g. Shield, Counterspell, Hellish Rebuke). Opens the spell picker filtered to reaction spells.",
  },
];

/** Filter universal actions by action-economy slot cost. */
export function universalActionsForCost(cost: ActionCost): TurnActionOption[] {
  return UNIVERSAL_ACTIONS.filter((a) => a.cost === cost);
}
