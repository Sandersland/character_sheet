/**
 * Pure 5e turn-economy rules — no JSX, no side effects.
 *
 * Extra Attack counts and per-class action lists are derived from class/level
 * rather than persisted (derive-don't-persist pattern, same as level/profBonus).
 *
 * ⚑ MOVEMENT is intentionally excluded from this module. Speed / difficult-terrain
 * tracking is flagged for a future phase.
 */

import type { ActionCost } from "@/types/character";

// ── Extra Attack ─────────────────────────────────────────────────────────────

/**
 * Number of weapon attacks a character can make when they take the Attack
 * action. Accounts for class-specific Extra Attack progression.
 *
 * Sources:
 *  - PHB "Extra Attack" feature text for each class
 *  - College of Valor Bard L6 (subclass Extra Attack, not in base bard)
 */
export function deriveAttacksPerAction(
  className: string,
  subclass: string | undefined,
  level: number,
): number {
  const cls = className.toLowerCase();

  if (cls === "fighter") {
    if (level >= 20) return 4;
    if (level >= 11) return 3;
    if (level >= 5) return 2;
    return 1;
  }

  if (
    cls === "barbarian" ||
    cls === "monk" ||
    cls === "paladin" ||
    cls === "ranger"
  ) {
    return level >= 5 ? 2 : 1;
  }

  if (cls === "bard") {
    // Only College of Valor gets Extra Attack, at bard level 6.
    const sub = (subclass ?? "").toLowerCase();
    if ((sub.includes("valor") || sub === "college of valor") && level >= 6) {
      return 2;
    }
    return 1;
  }

  // Cleric, Druid, Rogue, Sorcerer, Warlock, Wizard — no Extra Attack.
  return 1;
}

// ── Two-Weapon Fighting eligibility ──────────────────────────────────────────

/**
 * Returns true when the character's equipped loadout allows a TWF bonus-action
 * off-hand attack: exactly two weapons equipped, both of which are light
 * (light property = true on the weapon detail). The off-hand attack does NOT
 * add the ability modifier to damage (handled client-side on roll).
 *
 * The existing `offHandBusy` field on the serialized character covers the
 * versatile-grip calculation but is a boolean that conflates "shield equipped"
 * and "two weapons equipped." We re-derive from inventory here because we need
 * the distinction: two light weapons → TWF affordance; one weapon + shield → no TWF.
 */
export function canTwoWeaponFight(
  inventory: Array<{ equipped: boolean; category: string; weapon?: { light: boolean } | null }>,
): boolean {
  const equippedWeapons = inventory.filter(
    (i) => i.equipped && i.category === "weapon" && i.weapon,
  );
  if (equippedWeapons.length < 2) return false;
  // Both held weapons must have the light property for baseline TWF.
  // (The Two-Weapon Fighting fighting style removes the light restriction,
  // but we don't have a structured "has this fighting style" flag yet —
  // defaulting to light-only is the conservative/correct baseline.)
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
    label: "Grapple / Shove",
    cost: "action",
    description:
      "Attempt to grapple a creature (Athletics vs. Athletics/Acrobatics) or shove it prone/away. Uses one of your attack-action attacks if you have Extra Attack.",
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
