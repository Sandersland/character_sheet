/**
 * Frontend action-resolver registry.
 *
 * Mirrors the backend ACTION_EFFECT_FN dispatch table key-for-key. Each entry
 * describes:
 *   - Which inline tool to render when the player picks this action (kind).
 *   - Which economy slot it consumes (slot).
 *   - Whether the action fires applyActionTransactions server-side (serverEffect).
 *   - Optional resource spend metadata (resourceKey/resourceAmount) used by
 *     the TurnHub orchestrator to pass the right ops.
 *   - healRoll: a function producing the dice spec for fixed-dice self-heals
 *     (Second Wind). healInput: true for Lay on Hands (numeric pool draw, no die).
 *
 * Adding a new action = one row here + the matching ACTION_EFFECT_FN entry.
 * ⚑ Keep in sync with the backend ACTION_EFFECT_FN table.
 */

import type { Character } from "@/types/character";
import type { RollSpec } from "@/lib/dice";

/**
 * What inline tool the TurnHub renders when this action is selected.
 *  attack-picker  — equipped weapons + Unarmed + Improvised, with Attack/Damage rolls.
 *  spell-picker   — prepared/known spells, slot-gated cast surface.
 *  item-picker    — consumable inventory items with heal rolls.
 *  heal-roll      — single self-heal dice roll (Second Wind: 1d10+level).
 *  heal-input     — numeric pool draw (Lay on Hands: choose amount up to pool).
 *  loadout-picker — per-hand weapon-swap picker (a held swap costs the Action).
 *  simple-confirm — no tool; just consume the slot (Dodge, Dash, Rage, etc.).
 */
export type ResolutionKind =
  | "attack-picker"
  | "twf-picker"
  | "spell-picker"
  | "item-picker"
  | "heal-roll"
  | "heal-input"
  | "loadout-picker"
  | "simple-confirm";

export type SlotCost = "action" | "bonusAction" | "reaction" | "free" | "special";

export interface ActionResolver {
  /** Matches AvailableAction.key and ACTION_EFFECT_FN key in the backend. */
  key: string;
  kind: ResolutionKind;
  slot: SlotCost;
  /** Resource pool key spent server-side (omit for slot-only / no-server-effect actions). */
  resourceKey?: string;
  /** Number of pool units spent (default 1). */
  resourceAmount?: number;
  /**
   * For heal-roll kind: produces the dice spec to roll for the heal total.
   * e.g. Second Wind → { count: 1, faces: 10, modifier: character.level }
   */
  healRoll?: (character: Character) => RollSpec;
  /**
   * Whether this resolver fires applyActionTransactions after resolution.
   * false = ephemeral only (attack economy bookkeeping, Dodge, Reckless Attack).
   * true  = hits the backend to spend resources / heal / consume items.
   */
  serverEffect: boolean;
}

export const ACTION_RESOLVERS: Record<string, ActionResolver> = {
  attack:            { key: "attack",            kind: "attack-picker",  slot: "action",      serverEffect: false },
  castSpell:         { key: "castSpell",         kind: "spell-picker",   slot: "action",      serverEffect: false },
  castSpellBonus:    { key: "castSpellBonus",    kind: "spell-picker",   slot: "bonusAction", serverEffect: false },
  castSpellReaction: { key: "castSpellReaction", kind: "spell-picker",   slot: "reaction",    serverEffect: false },
  useObject:         { key: "useObject",         kind: "item-picker",    slot: "action",      serverEffect: true  },
  // Mid-turn weapon change (#815) — the picker itself owns the Action economy
  // (a held-item swap spends it; a free-hand draw/stow is free), so no slot is
  // consumed on open and no server executeAction fires.
  changeWeapons:     { key: "changeWeapons",     kind: "loadout-picker", slot: "action",      serverEffect: false },
  dodge:             { key: "dodge",             kind: "simple-confirm", slot: "action",      serverEffect: false },
  dash:              { key: "dash",              kind: "simple-confirm", slot: "action",      serverEffect: false },
  disengage:         { key: "disengage",         kind: "simple-confirm", slot: "action",      serverEffect: false },
  help:              { key: "help",              kind: "simple-confirm", slot: "action",      serverEffect: false },
  hide:              { key: "hide",              kind: "simple-confirm", slot: "action",      serverEffect: false },
  search:            { key: "search",            kind: "simple-confirm", slot: "action",      serverEffect: false },
  ready:             { key: "ready",             kind: "simple-confirm", slot: "action",      serverEffect: false },
  grapple:           { key: "grapple",           kind: "simple-confirm", slot: "action",      serverEffect: false },
  shove:             { key: "shove",             kind: "simple-confirm", slot: "action",      serverEffect: false },
  opportunityAttack: { key: "opportunityAttack", kind: "attack-picker",  slot: "reaction",    serverEffect: false },
  // Two-Weapon Fighting off-hand bonus attack (#732) — economy-only, like `attack`.
  twf:               { key: "twf",               kind: "twf-picker",     slot: "bonusAction", serverEffect: false },

  rage:              { key: "rage",              kind: "simple-confirm", slot: "bonusAction", serverEffect: true,  resourceKey: "rage" },
  endRage:           { key: "endRage",           kind: "simple-confirm", slot: "bonusAction", serverEffect: true  },
  recklessAttack:    { key: "recklessAttack",    kind: "simple-confirm", slot: "free",        serverEffect: false },

  bardicInspiration: { key: "bardicInspiration", kind: "simple-confirm", slot: "bonusAction", serverEffect: true,  resourceKey: "bardicInspiration" },

  channelDivinityCleric: { key: "channelDivinityCleric", kind: "simple-confirm", slot: "action", serverEffect: true, resourceKey: "channelDivinity" },

  wildShape:         { key: "wildShape",         kind: "simple-confirm", slot: "action",      serverEffect: true,  resourceKey: "wildShape" },

  secondWind: {
    key: "secondWind",
    kind: "heal-roll",
    slot: "bonusAction",
    serverEffect: true,
    resourceKey: "secondWind",
    healRoll: (c) => ({ count: 1, faces: 10, modifier: c.level }),
  },
  actionSurge:       { key: "actionSurge",       kind: "simple-confirm", slot: "special",     serverEffect: true,  resourceKey: "actionSurge" },

  flurryOfBlows:     { key: "flurryOfBlows",     kind: "attack-picker",  slot: "bonusAction", serverEffect: true,  resourceKey: "focus", resourceAmount: 2 },
  patientDefense:    { key: "patientDefense",    kind: "simple-confirm", slot: "bonusAction", serverEffect: true,  resourceKey: "focus" },
  stepOfTheWind:     { key: "stepOfTheWind",     kind: "simple-confirm", slot: "bonusAction", serverEffect: true,  resourceKey: "focus" },
  stunningStrike:    { key: "stunningStrike",    kind: "simple-confirm", slot: "free",        serverEffect: true,  resourceKey: "focus" },
  // Way of Shadow reminder actions (#440) — economy-only, like twf; no backend effect fn.
  shadowStep:        { key: "shadowStep",        kind: "simple-confirm", slot: "bonusAction", serverEffect: false },
  opportunist:       { key: "opportunist",       kind: "simple-confirm", slot: "reaction",    serverEffect: false },

  divineSense:       { key: "divineSense",       kind: "simple-confirm", slot: "action",      serverEffect: true,  resourceKey: "divineSense" },
  layOnHands:        { key: "layOnHands",        kind: "heal-input",     slot: "action",      serverEffect: true,  resourceKey: "layOnHands" },
  channelDivinityPaladin: { key: "channelDivinityPaladin", kind: "simple-confirm", slot: "action", serverEffect: true, resourceKey: "channelDivinity" },

  cunningAction:     { key: "cunningAction",     kind: "simple-confirm", slot: "bonusAction", serverEffect: false },

  metamagic:         { key: "metamagic",         kind: "simple-confirm", slot: "free",        serverEffect: true,  resourceKey: "sorceryPoints" },
};

/** Returns the resolver for the given action key, or undefined if unrecognized. */
export function resolverFor(key: string): ActionResolver | undefined {
  return ACTION_RESOLVERS[key];
}

/**
 * Keys of every resolver that fires a server effect.
 * Used by tests to assert parity with the backend ACTION_EFFECT_FN table.
 */
export const SERVER_EFFECT_KEYS = Object.values(ACTION_RESOLVERS)
  .filter((r) => r.serverEffect)
  .map((r) => r.key);
