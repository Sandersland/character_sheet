/**
 * spellPicker.ts — pure selection/slot predicates for InlineSpellPicker.
 *
 * No React, no JSX, no side effects — deterministic given the inputs. Owns the
 * "which spells are castable / at which slot levels" logic so the session panel
 * (and its hook) can stay presentational.
 */

import type { Spell, SpellSlots } from "@/types/character";

/** Economy slot the picker is managing. */
export type EconomySlot = "action" | "bonusAction" | "reaction";

/** Which kind of spell was cast in each economy slot this turn (5e restriction). */
export interface SpellCastThisTurn {
  action?: "cantrip" | "leveled";
  bonus?: "cantrip" | "leveled";
}

/** Slot levels (ascending) that still have a use remaining. */
export function availableSlotLevels(slots: SpellSlots[]): number[] {
  return slots
    .filter((s) => s.used < s.total)
    .map((s) => s.level)
    .sort((a, b) => a - b);
}

/** Mystic Arcanum levels (6th–9th) with a charge remaining. */
export function availableArcanaLevels(arcana: SpellSlots[]): number[] {
  return arcana.filter((a) => a.used < a.total).map((a) => a.level);
}

/** True when a cast at this level draws from a Mystic Arcanum charge, not a slot. */
export function isArcanumLevel(level: number | undefined, arcanaLevels: number[]): boolean {
  return level !== undefined && arcanaLevels.includes(level);
}

/** Available slot levels for a leveled spell (incl. a Mystic Arcanum charge). */
export function availableSlotsForSpell(
  spell: Spell,
  slotLevels: number[],
  arcanaLevels: number[],
): number[] {
  if (spell.level === 0) return [];
  const levels = slotLevels.filter((l) => l >= spell.level);
  if (isArcanumLevel(spell.level, arcanaLevels) && !levels.includes(spell.level)) {
    levels.push(spell.level);
  }
  return levels.sort((a, b) => a - b);
}

/** Resolved slot level: the chosen level, else the lowest available. */
export function resolvedSlot(
  spell: Spell,
  chosenSlotLevel: number | undefined,
  slotLevels: number[],
  arcanaLevels: number[],
): number | undefined {
  if (spell.level === 0) return undefined;
  if (chosenSlotLevel !== undefined) return chosenSlotLevel;
  return availableSlotsForSpell(spell, slotLevels, arcanaLevels)[0];
}

/** 5e bonus-action spell restriction flags derived from what was cast this turn. */
export function spellRestrictionFlags(
  slot: EconomySlot,
  spellCastThisTurn: SpellCastThisTurn,
): { bonusActionBlockedByActionSpell: boolean; actionLimitedToCantrips: boolean } {
  return {
    bonusActionBlockedByActionSpell: slot === "bonusAction" && spellCastThisTurn.action === "leveled",
    actionLimitedToCantrips: slot === "action" && spellCastThisTurn.bonus === "leveled",
  };
}

/** Economy hint shown when the 5e restriction blocks further casts. */
export function slotRestrictionHint(
  bonusActionBlockedByActionSpell: boolean,
  actionLimitedToCantrips: boolean,
): string | null {
  if (bonusActionBlockedByActionSpell) {
    return "Leveled spell cast this turn — bonus-action spell casting is not allowed (5e).";
  }
  if (actionLimitedToCantrips) {
    return "Bonus-action spell cast this turn — only cantrips may be cast with the action (5e).";
  }
  return null;
}

/** Options for filtering the spellbook down to spells castable right now. */
export interface CastableFilter {
  castingTimeFilter?: string;
  slotLevels: number[];
  arcanaLevels: number[];
  bonusActionBlockedByActionSpell: boolean;
  actionLimitedToCantrips: boolean;
}

/** Prepared/known spells castable now: slot available, casting-time + 5e rule OK. */
export function filterCastableSpells(spells: Spell[], opts: CastableFilter): Spell[] {
  return spells.filter((spell) => {
    if (!spell.prepared && spell.level > 0) return false;

    if (opts.castingTimeFilter) {
      if (!spell.castingTime?.toLowerCase().startsWith(opts.castingTimeFilter.toLowerCase())) {
        return false;
      }
    }

    if (opts.bonusActionBlockedByActionSpell) return false;
    if (opts.actionLimitedToCantrips && spell.level > 0) return false;

    if (spell.level === 0) return true;
    const hasSlotsAvailable = opts.slotLevels.some((l) => l >= spell.level);
    return hasSlotsAvailable || isArcanumLevel(spell.level, opts.arcanaLevels);
  });
}

/** Sort: cantrips first, then ascending level, then alphabetically. */
export function sortSpells(spells: Spell[]): Spell[] {
  return [...spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}
