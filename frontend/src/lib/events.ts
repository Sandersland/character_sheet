import type { CharacterEventCategory } from "@/types/character";

/**
 * Display helpers for the unified activity log (audit events).
 *
 * Mirrors the `ABILITY_LABELS` pattern: keep the storage keys (camelCase event types,
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
  // class
  subclassChosen: "Subclass chosen",
  subclassRemoved: "Subclass removed",
  fightingStyleChosen: "Fighting style chosen",
  fightingStyleRemoved: "Fighting style removed",
  // resources
  spendResource: "Spend resource",
  restoreResource: "Restore resource",
  learnManeuver: "Maneuver learned",
  forgetManeuver: "Maneuver forgotten",
  maneuversReconciled: "Maneuvers reconciled",
  learnToolProficiency: "Tool proficiency learned",
  forgetToolProficiency: "Tool proficiency forgotten",
  toolProficienciesReconciled: "Tool proficiencies reconciled",
  // advancement (ASI + feats)
  abilityScoreImprovement: "Ability score improvement",
  featTaken: "Feat taken",
  advancementRemoved: "Advancement removed",
  advancementsReconciled: "Advancements reconciled",
  // inventory (equip)
  equipped: "Equipped",
  unequipped: "Unequipped",
  // session lifecycle
  sessionStarted: "Session started",
  sessionEnded: "Session ended",
  // combat lifecycle
  combatStarted: "Combat started",
  combatEnded: "Combat ended",
  combatRoundAdvanced: "Round advanced",
  // conditions
  conditionApplied: "Condition applied",
  conditionRemoved: "Condition removed",
  exhaustionSet: "Exhaustion set",
  // rolls
  attackRoll: "Attack roll",
  damageRoll: "Damage roll",
  checkRoll: "Ability check",
  saveRoll: "Saving throw",
  initiativeRoll: "Initiative",
  // meta
  revert: "undo",
};

/** Resolve an event type to its display label, falling back to the raw key. */
export function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] ?? type;
}

// Badge tone per event category — reuses the existing design tokens.
const CATEGORY_TONE: Partial<
  Record<CharacterEventCategory, "vitality" | "gold" | "garnet" | "neutral" | "arcane">
> = {
  inventory: "gold",
  hitPoints: "vitality",
  experience: "arcane",
  currency: "gold",
  spellcasting: "arcane",
  class: "neutral",
  resources: "gold",
  advancement: "arcane",
  session: "neutral",
  combat: "garnet",
  conditions: "garnet",
  roll: "garnet",
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
  advancement: "Advancement",
  session: "Session",
  combat: "Combat",
  conditions: "Conditions",
  roll: "Rolls",
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
