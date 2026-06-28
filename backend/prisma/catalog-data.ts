// Pure 5e catalog seed data — no Prisma, no side effects.
//
// Extracted from seed.ts so these consts can be unit-tested without a DB
// connection (seed.ts calls main() at module load, which connects to
// Postgres). seed.ts imports everything here; the data is identical, just
// relocated. Rules-correctness invariants are guarded by
// prisma/__tests__/catalog-data.test.ts.
//
// NOTE: 5e *rules math* still lives in src/lib (srd.ts, experience.ts,
// starting-equipment.ts). This file is catalog seed rows only.

export const RACES = [
  // Dwarf subraces
  { name: "Hill Dwarf",     speed: 25 },
  { name: "Mountain Dwarf", speed: 25 },
  // Elf subraces
  { name: "High Elf",       speed: 30 },
  { name: "Wood Elf",       speed: 35 },
  { name: "Drow",           speed: 30 },
  // Halfling subraces
  { name: "Lightfoot Halfling", speed: 25 },
  { name: "Stout Halfling",     speed: 25 },
  // Human (no subrace split)
  { name: "Human",         speed: 30 },
  // Dragonborn (no subrace split in PHB)
  { name: "Dragonborn",    speed: 30 },
  // Gnome subraces
  { name: "Forest Gnome",  speed: 25 },
  { name: "Rock Gnome",    speed: 25 },
  // Half-races and Tiefling
  { name: "Half-Elf",      speed: 30 },
  { name: "Half-Orc",      speed: 30 },
  { name: "Tiefling",      speed: 30 },
  // Legacy generic entries — kept for back-compat with characters created
  // before this list was expanded to named subraces.
  { name: "Dwarf",         speed: 25 },
  { name: "Halfling",      speed: 25 },
  { name: "Gnome",         speed: 25 },
];

export const CLASSES = [
  {
    name: "Wizard",
    hitDie: "d6",
    savingThrows: ["intelligence", "wisdom"],
    skillChoiceCount: 2,
    skillChoices: ["arcana", "history", "insight", "investigation", "medicine", "religion"],
    isSpellcaster: true,
    subclassLevel: 2,
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
    subclassLevel: 3,
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
    subclassLevel: 3,
    toolProficiencies: ["Thieves' Tools"], // class always grants this
  },
  {
    name: "Cleric",
    hitDie: "d8",
    savingThrows: ["wisdom", "charisma"],
    skillChoiceCount: 2,
    skillChoices: ["history", "insight", "medicine", "persuasion", "religion"],
    isSpellcaster: true,
    subclassLevel: 1,
  },
  {
    name: "Barbarian",
    hitDie: "d12",
    savingThrows: ["strength", "constitution"],
    skillChoiceCount: 2,
    skillChoices: ["animalHandling", "athletics", "intimidation", "nature", "perception", "survival"],
    isSpellcaster: false,
    subclassLevel: 3,
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
    subclassLevel: 3,
    // PHB: Three musical instruments of your choice.
    toolChoiceCount: 3,
    toolChoices: [
      "Bagpipes", "Drum", "Dulcimer", "Flute", "Lute",
      "Lyre", "Horn", "Pan Flute", "Shawm", "Viol",
    ],
  },
  {
    name: "Druid",
    hitDie: "d8",
    savingThrows: ["intelligence", "wisdom"],
    skillChoiceCount: 2,
    skillChoices: ["arcana", "animalHandling", "insight", "medicine", "nature", "perception", "religion", "survival"],
    isSpellcaster: true,
    subclassLevel: 2,
  },
  {
    name: "Monk",
    hitDie: "d8",
    savingThrows: ["strength", "dexterity"],
    skillChoiceCount: 2,
    skillChoices: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"],
    isSpellcaster: false,
    subclassLevel: 3,
    // PHB: One type of artisan's tools or one musical instrument of your choice.
    toolChoiceCount: 1,
    toolChoices: [
      "Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies",
      "Carpenter's Tools", "Cartographer's Tools", "Cobbler's Tools",
      "Cook's Utensils", "Glassblower's Tools", "Jeweler's Tools",
      "Leatherworker's Tools", "Mason's Tools", "Painter's Supplies",
      "Potter's Tools", "Smith's Tools", "Tinker's Tools",
      "Weaver's Tools", "Woodcarver's Tools",
      "Bagpipes", "Drum", "Dulcimer", "Flute", "Lute",
      "Lyre", "Horn", "Pan Flute", "Shawm", "Viol",
    ],
  },
  {
    name: "Paladin",
    hitDie: "d10",
    savingThrows: ["wisdom", "charisma"],
    skillChoiceCount: 2,
    skillChoices: ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"],
    isSpellcaster: true,
    subclassLevel: 3,
  },
  {
    name: "Ranger",
    hitDie: "d10",
    savingThrows: ["strength", "dexterity"],
    skillChoiceCount: 3,
    skillChoices: ["animalHandling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"],
    isSpellcaster: true,
    subclassLevel: 3,
  },
  {
    name: "Sorcerer",
    hitDie: "d6",
    savingThrows: ["constitution", "charisma"],
    skillChoiceCount: 2,
    skillChoices: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"],
    isSpellcaster: true,
    subclassLevel: 1,
  },
  {
    name: "Warlock",
    hitDie: "d8",
    savingThrows: ["wisdom", "charisma"],
    skillChoiceCount: 2,
    skillChoices: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"],
    isSpellcaster: true,
    subclassLevel: 1,
  },
];

export function coins(gp: number, sp = 0, cp = 0) {
  return { cp, sp, gp, pp: 0 };
}

// Matches the Prisma schema's ItemCategory/ArmorCategory enums.
export type ItemCategoryName = "weapon" | "armor" | "consumable" | "gear";
export type ArmorCategoryName = "light" | "medium" | "heavy" | "shield";

// Mirrors ItemWeaponDetail/ItemArmorDetail/ItemConsumableDetail's own
// fields (minus id/itemId) — these objects are used directly as an Item's
// nested detail create, so there's exactly one place each
// weapon/armor/consumable's stats are typed in. Dice are
// count/faces/modifier (matching frontend/src/lib/dice.ts's
// RollSpec), not a "1d6" string — see schema.prisma's comment on
// ItemWeaponDetail for why.
export interface WeaponDetailInput {
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

export interface ArmorDetailInput {
  armorCategory: ArmorCategoryName;
  baseArmorClass: number;
  dexModifierApplies?: boolean;
  dexModifierMax?: number;
  stealthDisadvantage?: boolean;
  strengthRequirement?: number;
}

export interface ConsumableDetailInput {
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  effectDescription?: string;
}

export interface CatalogItem {
  name: string;
  category: ItemCategoryName;
  weight?: number;
  cost?: ReturnType<typeof coins>;
  description?: string;
  weapon?: WeaponDetailInput;
  armor?: ArmorDetailInput;
  consumable?: ConsumableDetailInput;
}

// --- Item catalog -------------------------------------------------------
// Baseline equipment list (served via GET /api/items, see
// src/routes/items.ts) covering all four ItemCategory values. Like
// RACES/CLASSES/BACKGROUNDS above, this seeds the catalog rows that
// InventoryItem rows below snapshot from — see schema.prisma's comment on
// Item/InventoryItem for why a snapshot rather than a live reference.
export const ITEMS: CatalogItem[] = [
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
  // ── New items for missing PHB classes ─────────────────────────────────────
  {
    name: "Scimitar",
    category: "weapon",
    weight: 3,
    cost: coins(25),
    weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageType: "slashing", finesse: true, light: true, weaponClass: "martial", weaponRange: "melee" },
  },
  {
    name: "Dart",
    category: "weapon",
    weight: 0.25,
    cost: coins(0, 0, 5),
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 4,
      damageType: "piercing",
      finesse: true,
      thrown: true,
      rangeNormal: 20,
      rangeLong: 60,
      weaponClass: "simple",
      weaponRange: "ranged",
    },
  },
  {
    name: "Druidic Focus",
    category: "gear",
    weight: 0,
    cost: coins(1),
    description: "A sprig of mistletoe, a totem, a staff, or a wooden rod used by druids as a spellcasting focus in place of material components.",
  },
];
