import type { CharacterEventCategory } from "@/types/character";

// Mirrors the ABILITY_LABELS pattern: an unknown key degrades to the raw key rather than crashing or being ad-hoc capitalized.
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
  castAbilitySlot: "cast",
  expendSlot: "slot used",
  restoreSlot: "slot restored",
  learnSpell: "learned",
  forgetSpell: "forgotten",
  prepareSpell: "prepared",
  unprepareSpell: "unprepared",
  concentrationDropped: "concentration dropped",
  subclassChosen: "Subclass chosen",
  subclassRemoved: "Subclass removed",
  fightingStyleChosen: "Fighting style chosen",
  fightingStyleRemoved: "Fighting style removed",
  spendResource: "Spend resource",
  restoreResource: "Restore resource",
  learnManeuver: "Maneuver learned",
  forgetManeuver: "Maneuver forgotten",
  maneuversReconciled: "Maneuvers reconciled",
  learnToolProficiency: "Tool proficiency learned",
  forgetToolProficiency: "Tool proficiency forgotten",
  toolProficienciesReconciled: "Tool proficiencies reconciled",
  abilityScoreImprovement: "Ability score improvement",
  featTaken: "Feat taken",
  advancementRemoved: "Advancement removed",
  advancementsReconciled: "Advancements reconciled",
  equipped: "Equipped",
  unequipped: "Unequipped",
  sessionStarted: "Session started",
  sessionEnded: "Session ended",
  combatStarted: "Combat started",
  combatEnded: "Combat ended",
  combatRoundAdvanced: "Round advanced",
  conditionApplied: "Condition applied",
  conditionRemoved: "Condition removed",
  exhaustionSet: "Exhaustion set",
  attackRoll: "Attack roll",
  damageRoll: "Damage roll",
  checkRoll: "Ability check",
  saveRoll: "Saving throw",
  initiativeRoll: "Initiative",
  revert: "undo",
};

export function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] ?? type;
}

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

export function categoryTone(
  category: CharacterEventCategory,
): "vitality" | "gold" | "garnet" | "neutral" | "arcane" {
  return CATEGORY_TONE[category] ?? "neutral";
}

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

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as CharacterEventCategory] ?? category;
}

// Order is the filter-chip display order, not alphabetical.
export const INVENTORY_EVENT_TYPES = [
  "acquired",
  "bought",
  "sold",
  "consumed",
  "removed",
] as const;

// Only five roles exist; damage-type words route through damageTypeTone instead, since a swing's damage type is a much finer-grained key than these roles.
export type LogTone = "default" | "muted" | "heal" | "resource" | "harm";

const LOG_TONE_CLASS: Record<LogTone, string> = {
  default: "text-parchment-800",
  muted: "text-parchment-500",
  heal: "text-vitality-700",
  resource: "text-gold-800",
  harm: "text-garnet-700",
};

export function logToneClass(tone: LogTone): string {
  return LOG_TONE_CLASS[tone];
}

// Physical types (piercing/slashing/bludgeoning) and any unmapped type are deliberately absent so they fall through to neutral ink — only the amount is emphasized for those, per the mockup ("hit for **8** piercing").
const DAMAGE_TYPE_TONE_CLASS: Partial<Record<string, string>> = {
  fire: "text-dmg-fire",
  cold: "text-dmg-cold",
  lightning: "text-dmg-lightning",
  acid: "text-dmg-acid",
  poison: "text-dmg-poison",
  necrotic: "text-dmg-necrotic",
  radiant: "text-dmg-radiant",
  force: "text-dmg-force",
  psychic: "text-dmg-psychic",
  thunder: "text-dmg-thunder",
};

export function damageTypeTone(damageType: string | null | undefined): string | null {
  return damageType ? (DAMAGE_TYPE_TONE_CLASS[damageType] ?? null) : null;
}
