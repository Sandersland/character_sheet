import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// --- Reference catalog -------------------------------------------------
// A small SRD subset populating the character-creation form's baseline
// lists (served via GET /api/reference, see src/routes/reference.ts).
// Covers every race/class/background used by SEED_CHARACTERS below, plus a
// handful of extra options so the form isn't a list of three.

const RACES = [
  { name: "Human", speed: 30 },
  { name: "Half-Elf", speed: 30 },
  { name: "Wood Elf", speed: 35 },
  { name: "Dwarf", speed: 25 },
  { name: "Halfling", speed: 25 },
  { name: "Half-Orc", speed: 30 },
  { name: "Gnome", speed: 25 },
  { name: "Tiefling", speed: 30 },
];

const CLASSES = [
  {
    name: "Wizard",
    hitDie: "d6",
    savingThrows: ["intelligence", "wisdom"],
    skillChoiceCount: 2,
    skillChoices: ["arcana", "history", "insight", "investigation", "medicine", "religion"],
    isSpellcaster: true,
  },
  {
    name: "Fighter",
    hitDie: "d10",
    savingThrows: ["strength", "constitution"],
    skillChoiceCount: 2,
    skillChoices: [
      "acrobatics",
      "animalHandling",
      "athletics",
      "history",
      "insight",
      "intimidation",
      "perception",
      "survival",
    ],
    isSpellcaster: false,
  },
  {
    name: "Rogue",
    hitDie: "d8",
    savingThrows: ["dexterity", "intelligence"],
    skillChoiceCount: 4,
    skillChoices: [
      "acrobatics",
      "athletics",
      "deception",
      "insight",
      "intimidation",
      "investigation",
      "perception",
      "performance",
      "persuasion",
      "sleightOfHand",
      "stealth",
    ],
    isSpellcaster: false,
  },
  {
    name: "Cleric",
    hitDie: "d8",
    savingThrows: ["wisdom", "charisma"],
    skillChoiceCount: 2,
    skillChoices: ["history", "insight", "medicine", "persuasion", "religion"],
    isSpellcaster: true,
  },
  {
    name: "Barbarian",
    hitDie: "d12",
    savingThrows: ["strength", "constitution"],
    skillChoiceCount: 2,
    skillChoices: ["animalHandling", "athletics", "intimidation", "nature", "perception", "survival"],
    isSpellcaster: false,
  },
  {
    name: "Bard",
    hitDie: "d8",
    savingThrows: ["dexterity", "charisma"],
    skillChoiceCount: 3,
    skillChoices: [
      "acrobatics",
      "animalHandling",
      "arcana",
      "athletics",
      "deception",
      "history",
      "insight",
      "intimidation",
      "investigation",
      "medicine",
      "nature",
      "perception",
      "performance",
      "persuasion",
      "religion",
      "sleightOfHand",
      "stealth",
      "survival",
    ],
    isSpellcaster: true,
  },
];

const BACKGROUNDS = [
  { name: "Sage", skillProficiencies: ["arcana", "history"] },
  { name: "Soldier", skillProficiencies: ["athletics", "intimidation"] },
  { name: "Charlatan", skillProficiencies: ["deception", "sleightOfHand"] },
  { name: "Acolyte", skillProficiencies: ["insight", "religion"] },
  { name: "Criminal", skillProficiencies: ["deception", "stealth"] },
  { name: "Folk Hero", skillProficiencies: ["animalHandling", "survival"] },
  { name: "Noble", skillProficiencies: ["history", "persuasion"] },
];

// A coin purse shorthand for an Item's `cost`/an InventoryItem's `cost` —
// both are the same {cp,sp,gp,pp} shape as Character.currency.
function coins(gp: number, sp = 0, cp = 0) {
  return { cp, sp, gp, pp: 0 };
}

// Matches the Prisma schema's ItemCategory/ArmorCategory enums.
type ItemCategoryName = "weapon" | "armor" | "consumable" | "gear";
type ArmorCategoryName = "light" | "medium" | "heavy" | "shield";

// Mirrors ItemWeaponDetail/ItemArmorDetail/ItemConsumableDetail's own
// fields (minus id/itemId) — these objects are used directly as both an
// Item's nested detail create AND, for catalog-derived inventory rows, the
// InventoryItem's own detail snapshot (see resolveInventoryRow below), so
// there's exactly one place each weapon/armor/consumable's stats are typed
// in. Dice are count/faces/modifier (matching frontend/src/lib/dice.ts's
// RollSpec), not a "1d6" string — see schema.prisma's comment on
// ItemWeaponDetail for why.
interface WeaponDetailInput {
  damageDiceCount: number;
  damageDiceFaces: number;
  damageModifier?: number;
  damageType: string;
  versatileDiceCount?: number;
  versatileDiceFaces?: number;
  finesse?: boolean;
  light?: boolean;
  heavy?: boolean;
  twoHanded?: boolean;
  reach?: boolean;
  thrown?: boolean;
  ammunition?: boolean;
  rangeNormal?: number;
  rangeLong?: number;
  weaponClass?: "simple" | "martial";
  weaponRange?: "melee" | "ranged";
}

interface ArmorDetailInput {
  armorCategory: ArmorCategoryName;
  baseArmorClass: number;
  dexModifierApplies?: boolean;
  dexModifierMax?: number;
  stealthDisadvantage?: boolean;
  strengthRequirement?: number;
}

interface ConsumableDetailInput {
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  effectDescription?: string;
}

interface CatalogItem {
  name: string;
  category: ItemCategoryName;
  weight?: number;
  cost?: ReturnType<typeof coins>;
  description?: string;
  weapon?: WeaponDetailInput;
  armor?: ArmorDetailInput;
  consumable?: ConsumableDetailInput;
}

// Nested-create fields for an Item's optional 1:1 detail relations.
function itemDetailCreateFields(item: CatalogItem) {
  return {
    weaponDetail: item.weapon ? { create: item.weapon } : undefined,
    armorDetail: item.armor ? { create: item.armor } : undefined,
    consumableDetail: item.consumable ? { create: item.consumable } : undefined,
  };
}

// Same, but for the `update` side of an upsert — a true 1:1 optional
// relation can nested-upsert directly, unlike the 1:many class/inventory
// relations elsewhere in this file that have to deleteMany+create instead.
function itemDetailUpsertFields(item: CatalogItem) {
  return {
    weaponDetail: item.weapon
      ? { upsert: { create: item.weapon, update: item.weapon } }
      : undefined,
    armorDetail: item.armor
      ? { upsert: { create: item.armor, update: item.armor } }
      : undefined,
    consumableDetail: item.consumable
      ? { upsert: { create: item.consumable, update: item.consumable } }
      : undefined,
  };
}

// --- Item catalog -------------------------------------------------------
// Baseline equipment list (served via GET /api/items, see
// src/routes/items.ts) covering all four ItemCategory values. Like
// RACES/CLASSES/BACKGROUNDS above, this seeds the catalog rows that
// InventoryItem rows below snapshot from — see schema.prisma's comment on
// Item/InventoryItem for why a snapshot rather than a live reference.
const ITEMS: CatalogItem[] = [
  // ── Simple melee weapons ──────────────────────────────────────────────────
  {
    name: "Club",
    category: "weapon",
    weight: 2,
    cost: coins(0, 1),
    weapon: { damageDiceCount: 1, damageDiceFaces: 4, damageType: "bludgeoning", light: true, weaponClass: "simple", weaponRange: "melee" },
  },
  {
    name: "Dagger",
    category: "weapon",
    weight: 1,
    cost: coins(2),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 4,
      damageType: "piercing",
      finesse: true,
      light: true,
      thrown: true,
      rangeNormal: 20,
      rangeLong: 60,
      weaponClass: "simple",
      weaponRange: "melee",
    },
  },
  {
    name: "Quarterstaff",
    category: "weapon",
    weight: 4,
    cost: coins(0, 2),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageType: "bludgeoning",
      versatileDiceCount: 1,
      versatileDiceFaces: 8,
      weaponClass: "simple",
      weaponRange: "melee",
    },
  },
  {
    name: "Mace",
    category: "weapon",
    weight: 4,
    cost: coins(5),
    weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageType: "bludgeoning", weaponClass: "simple", weaponRange: "melee" },
  },
  {
    name: "Javelin",
    category: "weapon",
    weight: 2,
    cost: coins(0, 5),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageType: "piercing",
      thrown: true,
      rangeNormal: 30,
      rangeLong: 120,
      weaponClass: "simple",
      weaponRange: "melee",
    },
  },
  // ── Simple ranged weapons ─────────────────────────────────────────────────
  {
    name: "Light Crossbow",
    category: "weapon",
    weight: 5,
    cost: coins(25),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageType: "piercing",
      ammunition: true,
      twoHanded: true,
      rangeNormal: 80,
      rangeLong: 320,
      weaponClass: "simple",
      weaponRange: "ranged",
    },
  },
  {
    name: "Shortbow",
    category: "weapon",
    weight: 2,
    cost: coins(25),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageType: "piercing",
      ammunition: true,
      twoHanded: true,
      rangeNormal: 80,
      rangeLong: 320,
      weaponClass: "simple",
      weaponRange: "ranged",
    },
  },
  // ── Martial melee weapons ─────────────────────────────────────────────────
  {
    name: "Shortsword",
    category: "weapon",
    weight: 2,
    cost: coins(10),
    weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageType: "piercing", finesse: true, light: true, weaponClass: "martial", weaponRange: "melee" },
  },
  {
    name: "Longsword",
    category: "weapon",
    weight: 3,
    cost: coins(15),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageType: "slashing",
      versatileDiceCount: 1,
      versatileDiceFaces: 10,
      weaponClass: "martial",
      weaponRange: "melee",
    },
  },
  {
    name: "Rapier",
    category: "weapon",
    weight: 2,
    cost: coins(25),
    weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "piercing", finesse: true, weaponClass: "martial", weaponRange: "melee" },
  },
  {
    name: "Warhammer",
    category: "weapon",
    weight: 2,
    cost: coins(15),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageType: "bludgeoning",
      versatileDiceCount: 1,
      versatileDiceFaces: 10,
      weaponClass: "martial",
      weaponRange: "melee",
    },
  },
  {
    name: "Handaxe",
    category: "weapon",
    weight: 2,
    cost: coins(5),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageType: "slashing",
      light: true,
      thrown: true,
      rangeNormal: 20,
      rangeLong: 60,
      weaponClass: "martial",
      weaponRange: "melee",
    },
  },
  {
    name: "Greataxe",
    category: "weapon",
    weight: 7,
    cost: coins(30),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 12,
      damageType: "slashing",
      heavy: true,
      twoHanded: true,
      weaponClass: "martial",
      weaponRange: "melee",
    },
  },
  // ── Martial ranged weapons ────────────────────────────────────────────────
  {
    name: "Longbow",
    category: "weapon",
    weight: 2,
    cost: coins(50),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageType: "piercing",
      ammunition: true,
      heavy: true,
      twoHanded: true,
      rangeNormal: 150,
      rangeLong: 600,
      weaponClass: "martial",
      weaponRange: "ranged",
    },
  },
  // ── Armor ─────────────────────────────────────────────────────────────────
  {
    name: "Leather Armor",
    category: "armor",
    weight: 10,
    cost: coins(10),
    armor: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true },
  },
  {
    name: "Scale Mail",
    category: "armor",
    weight: 45,
    cost: coins(50),
    armor: { armorCategory: "medium", baseArmorClass: 14, dexModifierApplies: true, dexModifierMax: 2, stealthDisadvantage: true },
  },
  {
    name: "Chain Mail",
    category: "armor",
    weight: 55,
    cost: coins(75),
    armor: { armorCategory: "heavy", baseArmorClass: 16, stealthDisadvantage: true, strengthRequirement: 13 },
  },
  {
    name: "Shield",
    category: "armor",
    weight: 6,
    cost: coins(10),
    description: "Worn on one arm; grants +2 AC while wielded.",
    armor: { armorCategory: "shield", baseArmorClass: 2 },
  },
  {
    name: "Plate Armor",
    category: "armor",
    weight: 65,
    cost: coins(1500),
    armor: { armorCategory: "heavy", baseArmorClass: 18, stealthDisadvantage: true, strengthRequirement: 15 },
  },
  // ── Consumables ───────────────────────────────────────────────────────────
  {
    name: "Potion of Healing",
    category: "consumable",
    weight: 0.5,
    cost: coins(50),
    consumable: { effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 2, effectDescription: "Restores hit points" },
  },
  {
    name: "Caltrops",
    category: "consumable",
    weight: 2,
    cost: coins(1),
    description: "Covers a 5-ft square. A creature entering must succeed a DC 15 Dex save or take 1 piercing damage and stop moving for the rest of its turn.",
  },
  // ── Ammunition ───────────────────────────────────────────────────────────
  { name: "Arrows", category: "gear", weight: 0.05, cost: coins(0, 5, 0), description: "A quiver of 20 arrows. Price is per arrow." },
  { name: "Crossbow Bolts", category: "gear", weight: 0.075, cost: coins(0, 5, 0), description: "A case of 20 bolts. Price is per bolt." },
  // ── Spellcasting foci & tools ─────────────────────────────────────────────
  { name: "Spellbook", category: "gear", weight: 3, cost: coins(50) },
  { name: "Component Pouch", category: "gear", weight: 2, cost: coins(25), description: "A small watertight pouch holding what a spellcaster needs to cast spells with material components." },
  { name: "Pearl (arcane focus)", category: "gear", weight: 0.1, cost: coins(100), description: "Used by a spellcaster as an arcane focus in place of components." },
  { name: "Holy Symbol", category: "gear", weight: 1, cost: coins(5), description: "An amulet, reliquary, or other symbol of a deity. Clerics and paladins use this as a spellcasting focus." },
  { name: "Lute", category: "gear", weight: 2, cost: coins(35), description: "A musical instrument; bards use it as a spellcasting focus." },
  { name: "Thieves' Tools", category: "gear", weight: 1, cost: coins(25), description: "Lockpicks, a small file, mirror, scissors, and tweezers." },
  { name: "Ink and Quill", category: "gear", cost: coins(10) },
  { name: "Healer's Kit", category: "gear", weight: 3, cost: coins(5), description: "Has 10 uses. As an action, expend one use to stabilize a creature without a Wisdom (Medicine) check." },
  // ── Equipment packs (also available as single gear items for the shop) ────
  { name: "Dungeoneer's Pack", category: "gear", weight: 61.5, cost: coins(12), description: "Includes a backpack, a crowbar, a hammer, 10 pitons, 10 torches, a tinderbox, 10 days of rations, a waterskin, and 50 ft of hempen rope." },
  { name: "Explorer's Pack", category: "gear", weight: 59, cost: coins(10), description: "Includes a backpack, a bedroll, a mess kit, a tinderbox, 10 torches, 10 days of rations, a waterskin, and 50 ft of hempen rope." },
  { name: "Burglar's Pack", category: "gear", weight: 44.5, cost: coins(16), description: "Includes a backpack, ball bearings (1000), 10 ft of string, a bell, 5 candles, a crowbar, a hammer, 10 pitons, a hooded lantern, 2 flasks of oil, 5 days of rations, a tinderbox, a waterskin, and 50 ft of hempen rope." },
  { name: "Priest's Pack", category: "gear", weight: 24, cost: coins(19), description: "Includes a backpack, a blanket, 10 candles, a tinderbox, an alms box, 2 blocks of incense, a censer, vestments, 2 days of rations, and a waterskin." },
  { name: "Diplomat's Pack", category: "gear", weight: 36, cost: coins(39), description: "Includes a chest, 2 cases for maps and scrolls, a set of fine clothes, a bottle of ink, an ink pen, a lamp, 2 flasks of oil, 5 sheets of paper, a vial of perfume, sealing wax, and soap." },
  { name: "Entertainer's Pack", category: "gear", weight: 38, cost: coins(40), description: "Includes a backpack, a bedroll, 2 costumes, 5 candles, 5 days of rations, a waterskin, and a disguise kit." },
  { name: "Scholar's Pack", category: "gear", weight: 11, cost: coins(40), description: "Includes a backpack, a book of lore, a bottle of ink, an ink pen, 10 sheets of parchment, a little bag of sand, and a small knife." },
  // ── Pack expansion items (individual rows when a pack is chosen) ──────────
  { name: "Backpack", category: "gear", weight: 5, cost: coins(2) },
  { name: "Crowbar", category: "gear", weight: 5, cost: coins(2) },
  { name: "Hammer", category: "gear", weight: 3, cost: coins(1) },
  { name: "Piton", category: "gear", weight: 0.25, cost: coins(0, 5, 0) },
  { name: "Torch", category: "gear", weight: 1, cost: coins(0, 1, 0), description: "Burns for 1 hour; bright light in 20 ft, dim 20 ft beyond. Can be used as an improvised weapon (1 fire damage)." },
  { name: "Tinderbox", category: "gear", weight: 1, cost: coins(0, 5, 0), description: "Used to light fires; takes an action to light a torch or similar." },
  { name: "Rations", category: "gear", weight: 2, cost: coins(0, 5, 0), description: "Dry foods suitable for extended travel." },
  { name: "Waterskin", category: "gear", weight: 5, cost: coins(0, 2, 0), description: "Holds up to 4 pints of liquid. Weight includes 4 pints of water." },
  { name: "Hempen Rope (50 ft)", category: "gear", weight: 10, cost: coins(1) },
  { name: "Bedroll", category: "gear", weight: 7, cost: coins(1) },
  { name: "Mess Kit", category: "gear", weight: 1, cost: coins(0, 2, 0), description: "Tin box with a cup and simple cutlery." },
  { name: "Ball Bearings", category: "gear", weight: 2, cost: coins(1), description: "As an action, scatter up to 1000 ball bearings (included) from a pouch across a 10-ft square. Creatures moving through must succeed DC 10 Dex or fall prone." },
  { name: "String (10 ft)", category: "gear", cost: coins(0, 0, 1) },
  { name: "Bell", category: "gear", weight: 0.1, cost: coins(1) },
  { name: "Candle", category: "gear", weight: 0.01, cost: coins(0, 0, 1), description: "Dim light in 5 ft for 1 hour." },
  { name: "Hooded Lantern", category: "gear", weight: 2, cost: coins(5), description: "Bright light in 30 ft and dim light for 30 ft beyond, or dim light in a 5-ft cone (hood closed). Burns for 6 hours per flask of oil." },
  { name: "Oil Flask", category: "consumable", weight: 1, cost: coins(0, 1, 0), description: "Fuels a lantern for 6 hours. Can be splashed on a surface or creature (DC 10 Dex, sets alight for 1d4 fire per round)." },
  { name: "Blanket", category: "gear", weight: 3, cost: coins(0, 5, 0) },
  { name: "Alms Box", category: "gear", weight: 1, cost: coins(0, 5, 0) },
  { name: "Incense Block", category: "gear", weight: 0.1, cost: coins(0, 2, 0) },
  { name: "Censer", category: "gear", weight: 2, cost: coins(5) },
  { name: "Vestments", category: "gear", weight: 4, cost: coins(5) },
  { name: "Chest", category: "gear", weight: 25, cost: coins(5), description: "Holds 300 lb / 12 cubic feet." },
  { name: "Map Case", category: "gear", weight: 1, cost: coins(1), description: "Scroll or map case; holds 10 rolled documents." },
  { name: "Fine Clothes", category: "gear", weight: 6, cost: coins(15) },
  { name: "Lamp", category: "gear", weight: 1, cost: coins(0, 5, 0), description: "Bright light in 15 ft, dim light 30 ft beyond. Burns for 6 hours per flask of oil." },
  { name: "Paper Sheet", category: "gear", weight: 0, cost: coins(0, 2, 0) },
  { name: "Perfume Vial", category: "gear", weight: 0, cost: coins(5) },
  { name: "Sealing Wax", category: "gear", weight: 0, cost: coins(0, 5, 0) },
  { name: "Soap", category: "gear", weight: 0, cost: coins(0, 0, 2) },
  { name: "Costume Clothes", category: "gear", weight: 4, cost: coins(5) },
  { name: "Disguise Kit", category: "gear", weight: 3, cost: coins(25), description: "Cosmetics, hair dye, small props, and a few costumes for creating disguises." },
  { name: "Book of Lore", category: "gear", weight: 5, cost: coins(25), description: "A book containing knowledge in a particular field." },
  { name: "Parchment Sheet", category: "gear", weight: 0, cost: coins(0, 1, 0) },
  { name: "Knife", category: "gear", weight: 0.5, cost: coins(0, 2, 0) },
];

// Per-character inventory row, specified as shorthand below and resolved
// against the catalog in main(): `catalogName` pulls the row's stats from
// the matching Item (the common, "don't hand-author your inventory" case),
// while an explicit `category` makes the row fully homebrew (itemId stays
// null) — e.g. a unique magic item with no baseline catalog entry. Either
// way `quantity`/`equipped`/`notes` are this row's own values, and a
// catalog row's fields can still be overridden (e.g. a `name` override for
// "Club +1") since InventoryItem only snapshots from the catalog, it
// doesn't keep reading it live.
type SeedInventoryRow =
  | { catalogName: string; name?: string; quantity?: number; equipped?: boolean; notes?: string }
  | (CatalogItem & { quantity?: number; equipped?: boolean; notes?: string });

// Equivalent of frontend/src/mock/characters.ts's three fixtures, ported
// here deliberately — backend and frontend are separate packages with no
// shared workspace, and this is fixture/seed data, not shared business
// logic. experiencePoints is chosen as each character's target level's
// exact lower threshold (level 5 -> 6500, level 6 -> 14000, level 7 ->
// 23000) so the seeded levels match what the frontend mock currently
// hardcodes.
//
// race/class/subclass/background here are seed-only identifiers used below
// to look up catalog rows and build each character's nested selections —
// they are not Character columns (see schema.prisma).
const SEED_CHARACTERS = [
  {
    id: "1",
    name: "Brielle Stormwind",
    race: "Half-Elf",
    class: "Wizard",
    subclass: "School of Evocation",
    background: "Sage",
    alignment: "Neutral Good",
    experiencePoints: 23000,

    armorClass: 13,
    initiativeBonus: 2,
    speed: 30,

    hitPoints: { current: 38, max: 46, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 7, die: "d6", spent: 0 },

    abilityScores: {
      strength: 8,
      dexterity: 14,
      constitution: 13,
      intelligence: 18,
      wisdom: 12,
      charisma: 10,
    },
    savingThrowProficiencies: ["intelligence", "wisdom"],
    skills: [
      { name: "arcana", ability: "intelligence", proficient: true, expertise: true },
      { name: "history", ability: "intelligence", proficient: true },
      { name: "investigation", ability: "intelligence", proficient: true },
      { name: "insight", ability: "wisdom", proficient: true },
      { name: "perception", ability: "wisdom", proficient: false },
      { name: "acrobatics", ability: "dexterity", proficient: false },
      { name: "animalHandling", ability: "wisdom", proficient: false },
      { name: "athletics", ability: "strength", proficient: false },
      { name: "deception", ability: "charisma", proficient: false },
      { name: "intimidation", ability: "charisma", proficient: false },
      { name: "medicine", ability: "wisdom", proficient: false },
      { name: "nature", ability: "intelligence", proficient: false },
      { name: "performance", ability: "charisma", proficient: false },
      { name: "persuasion", ability: "charisma", proficient: true },
      { name: "religion", ability: "intelligence", proficient: false },
      { name: "sleightOfHand", ability: "dexterity", proficient: false },
      { name: "stealth", ability: "dexterity", proficient: false },
      { name: "survival", ability: "wisdom", proficient: false },
    ],

    inventory: [
      { catalogName: "Quarterstaff", quantity: 1, equipped: true },
      { catalogName: "Spellbook", quantity: 1 },
      { catalogName: "Component Pouch", quantity: 1, equipped: true },
      {
        name: "Ring of Protection",
        category: "gear",
        quantity: 1,
        equipped: true,
        description: "+1 bonus to AC and saving throws.",
      },
      { catalogName: "Potion of Healing", quantity: 3 },
      { catalogName: "Scholar's Pack", quantity: 1 },
      { catalogName: "Ink and Quill", quantity: 1 },
      { catalogName: "Pearl (arcane focus)", quantity: 1 },
    ] satisfies SeedInventoryRow[],
    currency: { cp: 12, sp: 30, gp: 145, pp: 2 },

    spellcasting: {
      ability: "intelligence",
      spellSaveDC: 15,
      spellAttackBonus: 6,
      slots: [
        { level: 1, total: 4, used: 1 },
        { level: 2, total: 3, used: 0 },
        { level: 3, total: 3, used: 2 },
        { level: 4, total: 1, used: 0 },
      ],
      spells: [
        {
          id: "s1",
          name: "Fire Bolt",
          level: 0,
          school: "evocation",
          prepared: true,
          castingTime: "1 action",
          range: "120 ft",
          duration: "Instantaneous",
          description: "Ranged spell attack hurling a mote of fire, 2d10 fire damage.",
        },
        {
          id: "s2",
          name: "Mage Armor",
          level: 1,
          school: "conjuration",
          prepared: true,
          castingTime: "1 action",
          range: "Touch",
          duration: "8 hours",
          description: "Target's base AC becomes 13 + Dex modifier.",
        },
        {
          id: "s3",
          name: "Misty Step",
          level: 2,
          school: "conjuration",
          prepared: true,
          castingTime: "1 bonus action",
          range: "Self",
          duration: "Instantaneous",
          description: "Teleport up to 30 feet to an unoccupied space you can see.",
        },
        {
          id: "s4",
          name: "Fireball",
          level: 3,
          school: "evocation",
          prepared: true,
          castingTime: "1 action",
          range: "150 ft",
          duration: "Instantaneous",
          description: "8d6 fire damage in a 20-ft radius sphere, Dex save for half.",
        },
        {
          id: "s5",
          name: "Counterspell",
          level: 3,
          school: "abjuration",
          prepared: false,
          castingTime: "1 reaction",
          range: "60 ft",
          duration: "Instantaneous",
          description: "Interrupt a creature casting a spell.",
        },
        {
          id: "s6",
          name: "Polymorph",
          level: 4,
          school: "transmutation",
          prepared: false,
          castingTime: "1 action",
          range: "60 ft",
          duration: "Concentration, up to 1 hour",
          description: "Transform a creature into a new form.",
        },
      ],
    },

    journal: [
      {
        id: "j1",
        title: "The Sunken Library",
        date: "Hammer 12",
        body: "Recovered three waterlogged tomes from the flooded archive beneath Saltmere. One appears to be a treatise on tidal magic — worth deciphering once we're back at the Conclave.",
      },
      {
        id: "j2",
        title: "A Debt Repaid",
        date: "Alturiak 3",
        body: "Helped the Hollowmere militia drive off a band of raiders. Their captain owes us a favor — could be useful when we pass through again.",
      },
    ],
  },
  {
    id: "2",
    name: "Tordek Ironfist",
    race: "Dwarf",
    class: "Fighter",
    subclass: "Battle Master",
    background: "Soldier",
    alignment: "Lawful Good",
    experiencePoints: 6500,

    armorClass: 18,
    initiativeBonus: 0,
    speed: 25,

    hitPoints: { current: 44, max: 51, temp: 5, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 5, die: "d10", spent: 0 },

    abilityScores: {
      strength: 17,
      dexterity: 10,
      constitution: 16,
      intelligence: 9,
      wisdom: 13,
      charisma: 8,
    },
    savingThrowProficiencies: ["strength", "constitution"],
    skills: [
      { name: "athletics", ability: "strength", proficient: true },
      { name: "intimidation", ability: "charisma", proficient: true },
      { name: "perception", ability: "wisdom", proficient: true },
      { name: "survival", ability: "wisdom", proficient: true },
      { name: "acrobatics", ability: "dexterity", proficient: false },
      { name: "animalHandling", ability: "wisdom", proficient: false },
      { name: "arcana", ability: "intelligence", proficient: false },
      { name: "deception", ability: "charisma", proficient: false },
      { name: "history", ability: "intelligence", proficient: false },
      { name: "insight", ability: "wisdom", proficient: false },
      { name: "investigation", ability: "intelligence", proficient: false },
      { name: "medicine", ability: "wisdom", proficient: false },
      { name: "nature", ability: "intelligence", proficient: false },
      { name: "performance", ability: "charisma", proficient: false },
      { name: "persuasion", ability: "charisma", proficient: false },
      { name: "religion", ability: "intelligence", proficient: false },
      { name: "sleightOfHand", ability: "dexterity", proficient: false },
      { name: "stealth", ability: "dexterity", proficient: false },
    ],

    inventory: [
      {
        catalogName: "Warhammer",
        quantity: 1,
        equipped: true,
        notes: "Family heirloom, passed down for three generations.",
      },
      { catalogName: "Shield", quantity: 1, equipped: true },
      { catalogName: "Plate Armor", quantity: 1, equipped: true },
      { catalogName: "Handaxe", quantity: 2 },
      { catalogName: "Healer's Kit", quantity: 1 },
    ] satisfies SeedInventoryRow[],
    currency: { cp: 0, sp: 15, gp: 62, pp: 0 },

    spellcasting: null,
    journal: [],
  },
  {
    id: "3",
    name: "Lyra Nightsong",
    race: "Wood Elf",
    class: "Rogue",
    subclass: "Arcane Trickster",
    background: "Charlatan",
    alignment: "Chaotic Neutral",
    experiencePoints: 14000,

    armorClass: 15,
    initiativeBonus: 4,
    speed: 35,

    hitPoints: { current: 28, max: 39, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 6, die: "d8", spent: 0 },

    abilityScores: {
      strength: 10,
      dexterity: 18,
      constitution: 12,
      intelligence: 14,
      wisdom: 11,
      charisma: 13,
    },
    savingThrowProficiencies: ["dexterity", "intelligence"],
    skills: [
      { name: "stealth", ability: "dexterity", proficient: true, expertise: true },
      { name: "sleightOfHand", ability: "dexterity", proficient: true },
      { name: "deception", ability: "charisma", proficient: true },
      { name: "investigation", ability: "intelligence", proficient: true },
      { name: "perception", ability: "wisdom", proficient: true },
      { name: "acrobatics", ability: "dexterity", proficient: false },
      { name: "animalHandling", ability: "wisdom", proficient: false },
      { name: "arcana", ability: "intelligence", proficient: false },
      { name: "athletics", ability: "strength", proficient: false },
      { name: "history", ability: "intelligence", proficient: false },
      { name: "insight", ability: "wisdom", proficient: false },
      { name: "intimidation", ability: "charisma", proficient: false },
      { name: "medicine", ability: "wisdom", proficient: false },
      { name: "nature", ability: "intelligence", proficient: false },
      { name: "performance", ability: "charisma", proficient: false },
      { name: "persuasion", ability: "charisma", proficient: false },
      { name: "religion", ability: "intelligence", proficient: false },
      { name: "survival", ability: "wisdom", proficient: false },
    ],

    inventory: [
      { catalogName: "Shortsword", quantity: 2, equipped: true },
      { catalogName: "Shortbow", quantity: 1, equipped: true },
      { catalogName: "Thieves' Tools", quantity: 1 },
      {
        name: "Cloak of Elvenkind",
        category: "gear",
        quantity: 1,
        equipped: true,
        description:
          "Advantage on Stealth checks; creatures have disadvantage on checks to spot you.",
      },
    ] satisfies SeedInventoryRow[],
    currency: { cp: 40, sp: 8, gp: 210, pp: 1 },

    spellcasting: {
      ability: "intelligence",
      spellSaveDC: 13,
      spellAttackBonus: 5,
      slots: [{ level: 1, total: 3, used: 1 }],
      spells: [
        {
          id: "s1",
          name: "Mage Hand",
          level: 0,
          school: "conjuration",
          prepared: true,
          castingTime: "1 action",
          range: "30 ft",
          duration: "1 minute",
          description: "A spectral hand manipulates objects at range.",
        },
        {
          id: "s2",
          name: "Disguise Self",
          level: 1,
          school: "illusion",
          prepared: true,
          castingTime: "1 action",
          range: "Self",
          duration: "1 hour",
          description: "Change your appearance until the spell ends.",
        },
      ],
    },

    journal: [],
  },
];

// Resolves one SeedInventoryRow into an InventoryItem create payload —
// either a snapshot of a catalog Item (`catalogName` branch) or a fully
// homebrew row (itemId: null). See the SeedInventoryRow comment above. The
// detail sub-object (if any) is reused directly from the same CatalogItem
// literal the Item catalog itself was seeded from — at seed time the
// inventory row's detail is identical to the catalog's, no override applied.
function resolveInventoryRow(
  row: SeedInventoryRow,
  position: number,
  catalogByName: Map<string, CatalogItem>,
  itemIdsByName: Map<string, string>
) {
  if ("catalogName" in row) {
    const catalogItem = catalogByName.get(row.catalogName);
    const itemId = itemIdsByName.get(row.catalogName);
    if (!catalogItem || !itemId) {
      throw new Error(`Unknown seed catalogName: ${row.catalogName}`);
    }
    return {
      itemId,
      name: row.name ?? catalogItem.name,
      category: catalogItem.category,
      weight: catalogItem.weight,
      cost: catalogItem.cost,
      description: catalogItem.description,
      quantity: row.quantity ?? 1,
      equipped: row.equipped ?? false,
      notes: row.notes,
      position,
      ...itemDetailCreateFields(catalogItem),
    };
  }

  return {
    itemId: null,
    name: row.name,
    category: row.category,
    weight: row.weight,
    cost: row.cost,
    description: row.description,
    quantity: row.quantity ?? 1,
    equipped: row.equipped ?? false,
    notes: row.notes,
    position,
    ...itemDetailCreateFields(row),
  };
}

async function main() {
  const raceIds = new Map<string, string>();
  for (const race of RACES) {
    const row = await prisma.race.upsert({ where: { name: race.name }, create: race, update: race });
    raceIds.set(row.name, row.id);
  }

  const classIds = new Map<string, string>();
  for (const cls of CLASSES) {
    const row = await prisma.characterClass.upsert({ where: { name: cls.name }, create: cls, update: cls });
    classIds.set(row.name, row.id);
  }

  const backgroundIds = new Map<string, string>();
  for (const background of BACKGROUNDS) {
    const row = await prisma.background.upsert({
      where: { name: background.name },
      create: background,
      update: background,
    });
    backgroundIds.set(row.name, row.id);
  }

  const catalogByName = new Map<string, CatalogItem>(ITEMS.map((item) => [item.name, item]));
  const itemIdsByName = new Map<string, string>();
  for (const item of ITEMS) {
    const { name, category, weight, cost, description } = item;
    const row = await prisma.item.upsert({
      where: { name },
      create: { name, category, weight, cost, description, ...itemDetailCreateFields(item) },
      update: { name, category, weight, cost, description, ...itemDetailUpsertFields(item) },
    });
    itemIdsByName.set(row.name, row.id);
  }

  for (const { race, class: className, subclass, background, inventory, ...character } of SEED_CHARACTERS) {
    const raceId = raceIds.get(race);
    const classId = classIds.get(className);
    const backgroundId = backgroundIds.get(background);
    const inventoryItems = inventory.map((row, position) =>
      resolveInventoryRow(row, position, catalogByName, itemIdsByName)
    );

    await prisma.character.upsert({
      where: { id: character.id },
      create: {
        ...character,
        raceSelection: { create: { name: race, raceId } },
        backgroundSelection: { create: { name: background, backgroundId } },
        classEntries: { create: [{ name: className, subclass, classId, position: 0 }] },
        inventoryItems: { create: inventoryItems },
      },
      update: {
        ...character,
        raceSelection: {
          upsert: { create: { name: race, raceId }, update: { name: race, raceId } },
        },
        backgroundSelection: {
          upsert: { create: { name: background, backgroundId }, update: { name: background, backgroundId } },
        },
        // Class entries and inventory items both have no natural unique key
        // to upsert against, so re-seeding replaces them wholesale rather
        // than risking duplicates.
        classEntries: {
          deleteMany: {},
          create: [{ name: className, subclass, classId, position: 0 }],
        },
        inventoryItems: {
          deleteMany: {},
          create: inventoryItems,
        },
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
