import type { CharacterEventCategory } from "@/types/character";

/**
 * Display helpers for the unified activity log (audit events).
 *
 * Mirrors `lib/abilities.ts`: keep the storage keys (camelCase event types,
 * lowercase category names) out of the UI and resolve everything through these
 * lookups. The maps are intentionally `Partial<Record<…>>` and tolerant — an
 * unknown key degrades to the raw key rather than crashing or being ad-hoc
 * capitalized (the CLAUDE.md "never inline-capitalize keys" footgun).
 */

// Human-readable label per event type, shown in the activity badge.
export const EVENT_TYPE_LABELS: Partial<Record<string, string>> = {
  acquired: "acquired",
  bought: "bought",
  sold: "sold",
  consumed: "consumed",
  removed: "removed",
  damage: "damage",
  heal: "healed",
  setTemp: "temp HP",
  shortRest: "short rest",
  longRest: "long rest",
  levelUp: "level up",
  levelDown: "level down",
  deathSave: "death save",
  stabilize: "stabilize",
  xpAward: "XP",
  xpSet: "XP set",
  currencyAdjust: "currency",
  castSpell: "cast",
  expendSlot: "slot used",
  restoreSlot: "slot restored",
  learnSpell: "learned",
  forgetSpell: "forgotten",
  prepareSpell: "prepared",
  unprepareSpell: "unprepared",
  concentrationDropped: "concentration dropped",
  revert: "undo",
};

/** Resolve an event type to its display label, falling back to the raw key. */
export function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] ?? type;
}

// Badge tone per event category — reuses the existing design tokens.
export const CATEGORY_TONE: Partial<
  Record<CharacterEventCategory, "vitality" | "gold" | "garnet" | "neutral" | "arcane">
> = {
  inventory: "gold",
  hitPoints: "vitality",
  experience: "arcane",
  currency: "gold",
  spellcasting: "arcane",
  class: "neutral",
  resources: "gold",
  combat: "garnet",
};

/** Resolve an event category to its badge tone, defaulting to neutral. */
export function categoryTone(
  category: CharacterEventCategory,
): "vitality" | "gold" | "garnet" | "neutral" | "arcane" {
  return CATEGORY_TONE[category] ?? "neutral";
}

// Human-readable label per event category, used for filter controls.
export const CATEGORY_LABELS: Partial<Record<CharacterEventCategory, string>> = {
  inventory: "Inventory",
  hitPoints: "Hit Points",
  experience: "Experience",
  currency: "Currency",
  spellcasting: "Spellcasting",
  class: "Class",
  resources: "Resources",
  combat: "Combat",
};

/** Resolve a category to its display label, falling back to the raw key. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as CharacterEventCategory] ?? category;
}

/**
 * Inventory event types, in the order they should appear as filter chips.
 * Drives the per-type toggle row shown when the Inventory category is active.
 */
export const INVENTORY_EVENT_TYPES = [
  "acquired",
  "bought",
  "sold",
  "consumed",
  "removed",
] as const;
