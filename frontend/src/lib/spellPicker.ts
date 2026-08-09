/**
 * spellPicker.ts — pure selection/slot predicates for InlineSpellPicker.
 *
 * No React, no JSX, no side effects — deterministic given the inputs. Owns the
 * "which spells are castable / at which slot levels" logic so the session panel
 * (and its hook) can stay presentational.
 */

import type { Spell, SpellSlots, SpellEconomyState } from "@/types/character";

/** Economy slot the picker is managing. */
export type EconomySlot = "action" | "bonusAction" | "reaction";

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

/**
 * Project the SERVER-RESOLVED 5e bonus-action interlock (#1439) onto the
 * CastableFilter flags for one economy slot. The rule ("a leveled Action spell
 * blocks a bonus-action spell; a leveled bonus-action spell limits the Action to
 * cantrips") is resolved server-side and arrives as `SpellEconomyState`; this
 * only routes each served boolean to the picker slot it gates — never
 * re-deriving the rule from cast history. Both spell-picker surfaces
 * (InlineSpellPicker's own deriveSpellList and turnOptions' bonusSpellOptions)
 * call THIS, so they read one shared projection and can never disagree — the
 * seam that used to need the "mirror" latch. A reaction cast is never gated.
 */
export function restrictionFlagsForSlot(
  slot: EconomySlot,
  economy: SpellEconomyState,
): { bonusActionBlockedByActionSpell: boolean; actionLimitedToCantrips: boolean } {
  return {
    bonusActionBlockedByActionSpell: slot === "bonusAction" && economy.bonusActionBlockedByActionSpell,
    actionLimitedToCantrips: slot === "action" && economy.actionLimitedToCantrips,
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

/** One spell-level section of the cast sheet. Input must already be sorted
 *  (sortSpells) so sections and rows come out in display order. */
export interface SpellLevelGroup {
  level: number;
  spells: Spell[];
}

/** Group a sorted spell list into level sections (cantrips = level 0 first). */
export function groupSpellsByLevel(spells: Spell[]): SpellLevelGroup[] {
  const groups: SpellLevelGroup[] = [];
  for (const spell of spells) {
    const last = groups[groups.length - 1];
    if (last && last.level === spell.level) last.spells.push(spell);
    else groups.push({ level: spell.level, spells: [spell] });
  }
  return groups;
}

/**
 * Spell levels that are entirely hidden from the cast sheet: prepared spells
 * that match the casting-time filter but were dropped by filterCastableSpells
 * for lack of an affordable slot. Drives the "Level 2+ hidden" footer so the
 * existing slot-gating filter is visible instead of silent.
 */
export function hiddenSpellLevels(spells: Spell[], opts: CastableFilter): number[] {
  const levels = new Set<number>();
  for (const spell of spells) {
    if (spell.level === 0 || (!spell.prepared && spell.level > 0)) continue;
    if (
      opts.castingTimeFilter &&
      !spell.castingTime?.toLowerCase().startsWith(opts.castingTimeFilter.toLowerCase())
    ) {
      continue;
    }
    const affordable =
      opts.slotLevels.some((l) => l >= spell.level) || isArcanumLevel(spell.level, opts.arcanaLevels);
    if (!affordable) levels.add(spell.level);
  }
  return [...levels].sort((a, b) => a - b);
}

/** Slot pips for a level-section header, or null for cantrips / no such slots. */
export function slotPipsForLevel(
  slots: SpellSlots[],
  level: number,
): { total: number; used: number } | null {
  if (level === 0) return null;
  const slot = slots.find((s) => s.level === level);
  return slot ? { total: slot.total, used: slot.used } : null;
}

/** Footer note for hidden levels: "Level 2+ hidden — no slots remaining". */
export function hiddenLevelsNote(levels: number[]): string | null {
  if (levels.length === 0) return null;
  const contiguous = levels.every((l, i) => i === 0 || l === levels[i - 1] + 1);
  const label = contiguous ? `Level ${levels[0]}+` : `Levels ${levels.join(", ")}`;
  return `${label} hidden — no slots remaining`;
}

/** Right-aligned cost badge for a spell row: "free · action", "1 slot · bonus action". */
export function castCostBadge(spell: Spell): string {
  const t = (spell.castingTime ?? "").toLowerCase();
  const costWord = t.startsWith("1 bonus action")
    ? "bonus action"
    : t.startsWith("1 reaction")
      ? "reaction"
      : t.startsWith("1 action")
        ? "action"
        : t;
  return `${spell.level === 0 ? "free" : "1 slot"} · ${costWord}`;
}
