import type { Spell, SpellSlots, SpellEconomyState } from "@/types/character";

export type EconomySlot = "action" | "bonusAction" | "reaction";

export function availableSlotLevels(slots: SpellSlots[]): number[] {
  return slots
    .filter((s) => s.used < s.total)
    .map((s) => s.level)
    .sort((a, b) => a - b);
}

export function availableArcanaLevels(arcana: SpellSlots[]): number[] {
  return arcana.filter((a) => a.used < a.total).map((a) => a.level);
}

export function isArcanumLevel(level: number | undefined, arcanaLevels: number[]): boolean {
  return level !== undefined && arcanaLevels.includes(level);
}

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

export function restrictionFlagsForSlot(
  slot: EconomySlot,
  economy: SpellEconomyState,
): { bonusActionBlockedByActionSpell: boolean; actionLimitedToCantrips: boolean } {
  if (slot === "bonusAction") {
    return {
      bonusActionBlockedByActionSpell: economy.bonusActionBlockedByActionSpell,
      actionLimitedToCantrips: economy.bonusActionLimitedToCantrips,
    };
  }
  if (slot === "action") {
    return { bonusActionBlockedByActionSpell: false, actionLimitedToCantrips: economy.actionLimitedToCantrips };
  }
  return { bonusActionBlockedByActionSpell: false, actionLimitedToCantrips: false };
}

export function slotRestrictionHint(slot: EconomySlot, economy: SpellEconomyState): string | null {
  if (slot === "bonusAction") {
    if (economy.bonusActionBlockedByActionSpell) {
      return "Leveled spell cast this turn — no bonus-action spell allowed (5e).";
    }
    if (economy.bonusActionLimitedToCantrips) {
      return "Leveled spell cast this turn — only a cantrip may be cast as a bonus action (5e).";
    }
    return null;
  }
  if (slot === "action" && economy.actionLimitedToCantrips) {
    return "Bonus-action spell cast this turn — only cantrips may be cast with the action (5e).";
  }
  return null;
}

export interface SlotAffordabilityFilter {
  castingTimeFilter?: string;
  slotLevels: number[];
  arcanaLevels: number[];
}

export interface CastableFilter extends SlotAffordabilityFilter {
  bonusActionBlockedByActionSpell: boolean;
  actionLimitedToCantrips: boolean;
}

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

export function sortSpells(spells: Spell[]): Spell[] {
  return [...spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export interface SpellLevelGroup {
  level: number;
  spells: Spell[];
}

export function groupSpellsByLevel(spells: Spell[]): SpellLevelGroup[] {
  const groups: SpellLevelGroup[] = [];
  for (const spell of spells) {
    const last = groups[groups.length - 1];
    if (last && last.level === spell.level) last.spells.push(spell);
    else groups.push({ level: spell.level, spells: [spell] });
  }
  return groups;
}

export function hiddenSpellLevels(spells: Spell[], opts: SlotAffordabilityFilter): number[] {
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

export function slotPipsForLevel(
  slots: SpellSlots[],
  level: number,
): { total: number; used: number } | null {
  if (level === 0) return null;
  const slot = slots.find((s) => s.level === level);
  return slot ? { total: slot.total, used: slot.used } : null;
}

export function hiddenLevelsNote(levels: number[]): string | null {
  if (levels.length === 0) return null;
  const contiguous = levels.every((l, i) => i === 0 || l === levels[i - 1] + 1);
  const label = contiguous ? `Level ${levels[0]}+` : `Levels ${levels.join(", ")}`;
  return `${label} hidden — no slots remaining`;
}

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
