/** Declared here (not backend) because `contracts` may import nothing and `inventorySnapshotSchema` validates against these tuples; each is latched to `snapshotCapabilitySchema`'s corresponding union member. */

export const CAPABILITY_KINDS = ["passiveBonus", "castSpell", "charges", "grant", "activatedEffect"] as const;

export const CAPABILITY_TARGETS = [
  "ac",
  "attack",
  "damage",
  "save",
  "skill",
  "abilityScore",
  "spellAttack",
  "spellDc",
  "initiative",
  "speed",
  "maxHp",
] as const;

export const CAPABILITY_OPS = ["add", "setTo"] as const;

export const ATTUNEMENT_PREREQ_KINDS = ["class", "spellcaster", "species", "alignment"] as const;

export const CAST_RESOURCES = ["perRestShort", "perRestLong", "perDayDawn", "perDayDusk", "atWill", "charges"] as const;

export const CAST_STAT_MODES = ["fixed", "wielder"] as const;

export const CHARGE_TRIGGERS = ["short", "long", "dawn", "dusk"] as const;

// "sense"/"movement" are reserved: valid enum values the DM can't yet author, and nothing derives from them yet.
export const GRANT_TYPES = ["resistance", "immunity", "conditionImmunity", "advantage", "proficiency"] as const;

export const ADVANTAGE_ON = ["save", "check", "initiative", "attack"] as const;

// Disambiguates what the flat `grantValue` column names — damage type, condition, skill/ability/save key, or weapon/tool/language name.
export const GRANT_VALUE_KINDS = ["damageType", "condition", "skill", "ability", "save", "weapon", "tool", "language"] as const;

// Exported so capability-wire-contract.test.ts can latch it to the shared ProficiencyKind.
export const PROFICIENCY_KINDS = ["skill", "save", "weapon", "tool", "language"] as const;

// Transcribed from Prisma's ActivationType enum; keep in sync.
export const ACTIVATION_TYPES = ["action", "bonus", "reaction", "commandWord"] as const;

// whileActive = manual toggle-off, untilRest = a rest ends it.
export const ACTIVATED_DURATIONS = ["whileActive", "untilRest"] as const;

// FOUR members — perRest is easy to drop by accident.
export const ITEM_RESOURCE_KINDS = ["perRest", "perDay", "atWill", "charges"] as const;

export const ITEM_RESOURCE_PERIODS = ["short", "long", "dawn", "dusk"] as const;

export const ARMOR_CATEGORIES = ["light", "medium", "heavy", "shield"] as const;

export const WEAPON_CLASSES = ["simple", "martial"] as const;

export const WEAPON_RANGES = ["melee", "ranged"] as const;

export const ITEM_CATEGORIES = ["weapon", "armor", "consumable", "gear"] as const;

export const EQUIP_SLOTS = [
  "MAIN_HAND",
  "OFF_HAND",
  "BODY",
  "HEAD",
  "NECK",
  "CLOAK",
  "HANDS",
  "WRISTS",
  "BELT",
  "FEET",
  "RING",
] as const;

// Rarity KEYS only — gp values stay backend-side in ITEM_RARITIES, which re-exports this tuple.
export const ITEM_RARITY_KEYS = ["COMMON", "UNCOMMON", "RARE", "VERY_RARE", "LEGENDARY", "ARTIFACT"] as const;
