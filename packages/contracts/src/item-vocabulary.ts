/**
 * The item + capability vocabulary, as `as const` tuples (#1647, epic #1644).
 *
 * These live HERE rather than backend-side because inventorySnapshotSchema
 * validates against them and .fallowrc.jsonc makes this package a leaf zone:
 * contracts may import nothing, so a tuple the schema uses has to be declared
 * in it. The backend's capability adapter re-exports every symbol, so the
 * modules importing them from there keep resolving unchanged — and
 * capability-wire-contract.test.ts still latches each tuple to its shared
 * union, which is what stops one side gaining a value the other lacks.
 *
 * Rules DATA does not belong here: ITEM_RARITY_KEYS is the rarity key domain
 * only, and the gp values stay in the backend's ITEM_RARITIES.
 */

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

// castSpell resource + stat-mode enums (#528), value tuples so the route schema
// and the frontend option lists share one source of truth with the shared unions.
export const CAST_RESOURCES = ["perRestShort", "perRestLong", "perDayDawn", "perDayDusk", "atWill", "charges"] as const;

export const CAST_STAT_MODES = ["fixed", "wielder"] as const;

// Recharge triggers for a charges pool (#555) — the ItemResourcePeriod values,
// as a tuple so the route schema and frontend option list share one source.
export const CHARGE_TRIGGERS = ["short", "long", "dawn", "dusk"] as const;

// grant kind (#529). "sense"/"movement" are reserved: valid enum values the DM
// can't yet author and no derivation consumes them.
export const GRANT_TYPES = ["resistance", "immunity", "conditionImmunity", "advantage", "proficiency"] as const;

export const ADVANTAGE_ON = ["save", "check", "initiative", "attack"] as const;

// What grantValue names: a damage type, a condition, a skill/ability/save key,
// or a weapon/tool/language name. Disambiguates the flat grantValue column.
export const GRANT_VALUE_KINDS = ["damageType", "condition", "skill", "ability", "save", "weapon", "tool", "language"] as const;

// Proficiency grants name one of these categories via grantValueKind; exported
// so capability-wire-contract.test.ts can latch it to the shared ProficiencyKind.
export const PROFICIENCY_KINDS = ["skill", "save", "weapon", "tool", "language"] as const;

// ── Transcribed from schema.prisma's enums (verified at af27771c) ────────────

export const ACTIVATION_TYPES = ["action", "bonus", "reaction", "commandWord"] as const;

// ActivatedDuration: whileActive = manual toggle-off, untilRest = a rest ends it.
export const ACTIVATED_DURATIONS = ["whileActive", "untilRest"] as const;

// ItemResourceKind — FOUR members. perRest is easy to drop by accident.
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

// Rarity KEYS only — the gp values are 5e rules data and stay backend-side
// (lib/srd/item-rarity.ts's ITEM_RARITIES). This tuple moved out of that file
// (it declared its own identical ITEM_RARITY_KEYS) rather than being
// re-transcribed, so the two never drift into a mirror pair; item-rarity.ts
// re-exports it from here.
export const ITEM_RARITY_KEYS = ["COMMON", "UNCOMMON", "RARE", "VERY_RARE", "LEGENDARY", "ARTIFACT"] as const;
