/**
 * turnOptions.ts — pure render models for the TurnHub option-card sheets.
 *
 * No React, no JSX, no side effects. Composes the existing derivations
 * (attackMath, spellPicker, resource pools, resolver metadata) into the
 * display strings the Action / Bonus Action / Reaction pickers render, so
 * the sheet components stay presentational and this logic stays unit-testable.
 *
 * Icons deliberately live in the components (key → IconType maps), not here.
 */

import { buildAttackEntries, buildOffHandEntry } from "@/lib/attackMath";
import { formatRollSpec } from "@/lib/dice";
import { effectPreviewWithMod } from "@/lib/spellMeta";
import {
  availableArcanaLevels,
  availableSlotLevels,
  filterCastableSpells,
  sortSpells,
  spellRestrictionFlags,
  type SpellCastThisTurn,
} from "@/lib/spellPicker";
import { canTwoWeaponFight, type TurnActionOption } from "@/lib/turnRules";
import type { ActionResolver } from "@/features/session/actionResolvers";
import type { AvailableAction, Character, ResourcePool } from "@/types/character";

// ── Attack summaries ──────────────────────────────────────────────────────────

/** "Longsword · +7 to hit · 1d8 + 4 slashing" for the first attack row
 *  (first equipped weapon, falling back naturally to Unarmed Strike). */
export function mainWeaponSummary(character: Character): string {
  const entry = buildAttackEntries(character)[0];
  return `${entry.name} · ${entry.attackLabel} to hit · ${entry.damageLabel}`;
}

/** Off-hand (TWF) equivalent, or null when the loadout can't dual-wield. */
export function offHandSummary(character: Character): string | null {
  const entry = buildOffHandEntry(character);
  return entry ? `${entry.name} · ${entry.attackLabel} to hit · ${entry.damageLabel}` : null;
}

// ── Item / resource badges ────────────────────────────────────────────────────

/** Total consumable quantity in the pack — the "×N" badge on Use an item. */
export function consumableCount(character: Character): number {
  return character.inventory
    .filter((item) => item.category === "consumable")
    .reduce((sum, item) => sum + item.quantity, 0);
}

/** Resource-pool badge for a class action, e.g. "1 / rest", or undefined
 *  when the action spends no pool (or the pool isn't on the character). */
export function poolBadgeFor(
  resourceKey: string | undefined,
  pools: ResourcePool[] | undefined,
): string | undefined {
  if (!resourceKey) return undefined;
  const pool = pools?.find((p) => p.key === resourceKey);
  if (!pool) return undefined;
  switch (pool.recharge) {
    case "shortRest":
    case "short-or-long":
      return `${pool.remaining} / rest`;
    case "longRest":
      return `${pool.remaining} / long rest`;
    default:
      return `×${pool.remaining}`;
  }
}

// ── Class-action cards ────────────────────────────────────────────────────────

/** Render model for one class-action option card. */
export interface ClassActionOption {
  key: string;
  title: string;
  enabled: boolean;
  disabledReason?: string;
  /** e.g. "Regain 1d10 + 3 HP" for heal-roll resolvers; undefined otherwise. */
  subtitle?: string;
  /** Pool badge, e.g. "1 / rest". */
  badge?: string;
  /** True for self-heal resolvers — the card renders in the vitality tone. */
  heal: boolean;
}

/** Enrich a backend AvailableAction with resolver-derived subtitle + pool badge. */
export function classActionOption(
  action: AvailableAction,
  resolver: ActionResolver | undefined,
  character: Character,
): ClassActionOption {
  const heal = resolver?.kind === "heal-roll" || resolver?.kind === "heal-input";
  const badge = poolBadgeFor(resolver?.resourceKey, character.resources?.pools);
  return {
    key: action.key,
    title: action.name,
    enabled: action.enabled,
    ...(action.disabledReason ? { disabledReason: action.disabledReason } : {}),
    ...(resolver?.kind === "heal-roll" && resolver.healRoll
      ? { subtitle: `Regain ${formatRollSpec(resolver.healRoll(character))} HP` }
      : {}),
    ...(badge ? { badge } : {}),
    heal,
  };
}

// ── Bonus-action spell cards ──────────────────────────────────────────────────

/** Render model for one castable bonus-action spell card. */
export interface BonusSpellOption {
  /** Spellbook entry id (Spell.id) — passed to the pre-selected cast flow. */
  spellId: string;
  name: string;
  /** "Bonus-action cast · 1d4 + 3 healing" (effect preview when derivable). */
  subtitle: string;
  /** "at will" for cantrips, "L1 slot" etc. for leveled spells. */
  badge: string;
}

/**
 * Castable bonus-action spells for the Bonus Action sheet. Mirrors
 * useSpellPicker's filtering argument-for-argument (same pure predicates,
 * castingTimeFilter "1 bonus action") so the card list and the picker that
 * opens from it can never disagree.
 */
export function bonusSpellOptions(
  character: Character,
  spellCastThisTurn: SpellCastThisTurn,
): BonusSpellOption[] {
  const spellcasting = character.spellcasting;
  if (!spellcasting) return [];
  const slotLevels = availableSlotLevels(spellcasting.slots ?? []);
  const arcanaLevels = availableArcanaLevels(spellcasting.arcana ?? []);
  const { bonusActionBlockedByActionSpell, actionLimitedToCantrips } = spellRestrictionFlags(
    "bonusAction",
    spellCastThisTurn,
  );
  const castable = filterCastableSpells(spellcasting.spells ?? [], {
    castingTimeFilter: "1 bonus action",
    slotLevels,
    arcanaLevels,
    bonusActionBlockedByActionSpell,
    actionLimitedToCantrips,
  });
  return sortSpells(castable).map((spell) => {
    const preview = effectPreviewWithMod(spell, character);
    return {
      spellId: spell.id,
      name: spell.name,
      subtitle: preview ? `Bonus-action cast · ${preview}` : "Bonus-action cast",
      badge: spell.level === 0 ? "at will" : `L${spell.level} slot`,
    };
  });
}

// ── Two-Weapon Fighting hint ──────────────────────────────────────────────────

/**
 * Footer hint for the Bonus Action sheet when TWF is unavailable. Names a
 * concrete owned light-weapon pair when one exists ("equip Two Shortswords…"),
 * else falls back to the generic requirement. Null when TWF is already live.
 */
export function twfHint(character: Character): string | null {
  if (canTwoWeaponFight(character.inventory, character.resources?.fightingStyle)) return null;
  const lightWeapons = character.inventory.filter(
    (item) => item.category === "weapon" && item.weapon?.light === true,
  );
  if (lightWeapons.length < 2) {
    return "Off-hand attack needs two light weapons equipped.";
  }
  const [first, second] = lightWeapons;
  const pair = first.name === second.name ? `Two ${first.name}s` : `${first.name} & ${second.name}`;
  return `Off-hand attack needs two light weapons — equip ${pair} to enable it.`;
}

// ── More-actions disclosure ───────────────────────────────────────────────────

/** Which universal actions render as primary rich cards on the Action sheet;
 *  everything else falls into the "More actions" disclosure grid. */
export const PRIMARY_ACTION_KEYS: ReadonlySet<string> = new Set([
  "attack",
  "castSpell",
  "useObject",
  "dash",
  "dodge",
]);

/** Micro-captions for the compact card variants (Dash/Dodge pair + More grid). */
export const MICRO_CAPTIONS: Record<string, string> = {
  dash: "×2 move",
  dodge: "defensive",
  disengage: "no OA",
  help: "adv. ally",
  hide: "stealth",
  search: "perception",
  ready: "trigger",
  grapple: "grab",
  shove: "push/prone",
};

/** Collapsed-row preview line: "Disengage · Hide · Help · …" (CSS truncates). */
export function moreActionsPreview(actions: TurnActionOption[]): string {
  return actions.map((a) => a.label).join(" · ");
}

// ── Sheet models (built in useTurnActions, consumed by the sheet bodies) ─────

export interface ActionSheetModel {
  attackSummary: string;
  consumableCount: number;
  hasSpellcasting: boolean;
  classActionOptions: ClassActionOption[];
}

export interface BonusSheetModel {
  classBonusOptions: ClassActionOption[];
  bonusSpells: BonusSpellOption[];
  twfHintText: string | null;
  offHandSummary: string | null;
}

export interface ReactionSheetModel {
  attackSummary: string;
  hasSpellcasting: boolean;
  classReactionOptions: ClassActionOption[];
}
