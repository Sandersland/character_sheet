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

// Matches the Prisma schema's ItemCategory enum.
type ItemCategoryName = "weapon" | "armor" | "consumable" | "gear";

interface CatalogItem {
  name: string;
  category: ItemCategoryName;
  weight?: number;
  cost?: ReturnType<typeof coins>;
  damageDice?: string;
  damageType?: string;
  armorClass?: number;
  properties?: string[];
  description?: string;
}

// --- Item catalog -------------------------------------------------------
// Baseline equipment list (served via GET /api/items, see
// src/routes/items.ts) covering all four ItemCategory values. Like
// RACES/CLASSES/BACKGROUNDS above, this seeds the catalog rows that
// InventoryItem rows below snapshot from — see schema.prisma's comment on
// Item/InventoryItem for why a snapshot rather than a live reference.
const ITEMS: CatalogItem[] = [
  // weapon
  { name: "Club", category: "weapon", weight: 2, cost: coins(0, 1), damageDice: "1d4", damageType: "bludgeoning", properties: ["light"] },
  { name: "Dagger", category: "weapon", weight: 1, cost: coins(2), damageDice: "1d4", damageType: "piercing", properties: ["finesse", "light", "thrown (range 20/60)"] },
  { name: "Quarterstaff", category: "weapon", weight: 4, cost: coins(0, 2), damageDice: "1d6", damageType: "bludgeoning", properties: ["versatile (1d8)"] },
  { name: "Shortsword", category: "weapon", weight: 2, cost: coins(10), damageDice: "1d6", damageType: "piercing", properties: ["finesse", "light"] },
  { name: "Longsword", category: "weapon", weight: 3, cost: coins(15), damageDice: "1d8", damageType: "slashing", properties: ["versatile (1d10)"] },
  { name: "Warhammer", category: "weapon", weight: 2, cost: coins(15), damageDice: "1d8", damageType: "bludgeoning", properties: ["versatile (1d10)"] },
  { name: "Handaxe", category: "weapon", weight: 2, cost: coins(5), damageDice: "1d6", damageType: "slashing", properties: ["light", "thrown (range 20/60)"] },
  { name: "Shortbow", category: "weapon", weight: 2, cost: coins(25), damageDice: "1d6", damageType: "piercing", properties: ["ammunition (range 80/320)", "two-handed"] },
  // armor
  { name: "Leather Armor", category: "armor", weight: 10, cost: coins(10), armorClass: 11, properties: ["light"] },
  { name: "Shield", category: "armor", weight: 6, cost: coins(10), armorClass: 2, description: "Worn on one arm; grants +2 AC while wielded." },
  { name: "Plate Armor", category: "armor", weight: 65, cost: coins(1500), armorClass: 18, properties: ["heavy", "stealth disadvantage"] },
  // consumable
  { name: "Potion of Healing", category: "consumable", weight: 0.5, cost: coins(50), description: "Regain 2d4 + 2 hit points when you drink this potion." },
  { name: "Caltrops", category: "consumable", weight: 2, cost: coins(1), description: "Covers a 5-ft square. A creature entering must succeed a DC 15 Dex save or take 1 piercing damage and stop moving for the rest of its turn." },
  // gear
  { name: "Spellbook", category: "gear", weight: 3, cost: coins(50) },
  { name: "Component Pouch", category: "gear", weight: 2, cost: coins(25), description: "A small watertight pouch holding what a spellcaster needs to cast spells with material components." },
  { name: "Scholar's Pack", category: "gear", weight: 11, cost: coins(40), description: "Includes a backpack, a book of lore, ink, an ink pen, parchment, a sand bag, and a small knife." },
  { name: "Ink and Quill", category: "gear", cost: coins(10) },
  { name: "Pearl (arcane focus)", category: "gear", weight: 0.1, cost: coins(100), description: "Used by a spellcaster as an arcane focus in place of components." },
  { name: "Healer's Kit", category: "gear", weight: 3, cost: coins(5), description: "Has 10 uses. As an action, expend one use to stabilize a creature without a Wisdom (Medicine) check." },
  { name: "Thieves' Tools", category: "gear", weight: 1, cost: coins(25), description: "Lockpicks, a small file, mirror, scissors, and tweezers." },
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

    hitPoints: { current: 38, max: 46, temp: 0 },
    hitDice: { total: 7, die: "d6" },

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

    hitPoints: { current: 44, max: 51, temp: 5 },
    hitDice: { total: 5, die: "d10" },

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

    hitPoints: { current: 28, max: 39, temp: 0 },
    hitDice: { total: 6, die: "d8" },

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
// homebrew row (itemId: null). See the SeedInventoryRow comment above.
function resolveInventoryRow(
  row: SeedInventoryRow,
  position: number,
  itemsByName: Map<string, Awaited<ReturnType<typeof prisma.item.upsert>>>
) {
  if ("catalogName" in row) {
    const catalogItem = itemsByName.get(row.catalogName);
    if (!catalogItem) {
      throw new Error(`Unknown seed catalogName: ${row.catalogName}`);
    }
    return {
      itemId: catalogItem.id,
      name: row.name ?? catalogItem.name,
      category: catalogItem.category,
      weight: catalogItem.weight,
      cost: catalogItem.cost,
      damageDice: catalogItem.damageDice,
      damageType: catalogItem.damageType,
      armorClass: catalogItem.armorClass,
      properties: catalogItem.properties,
      description: catalogItem.description,
      quantity: row.quantity ?? 1,
      equipped: row.equipped ?? false,
      notes: row.notes,
      position,
    };
  }

  return {
    itemId: null,
    name: row.name,
    category: row.category,
    weight: row.weight,
    cost: row.cost,
    damageDice: row.damageDice,
    damageType: row.damageType,
    armorClass: row.armorClass,
    properties: row.properties ?? [],
    description: row.description,
    quantity: row.quantity ?? 1,
    equipped: row.equipped ?? false,
    notes: row.notes,
    position,
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

  const itemsByName = new Map<string, Awaited<ReturnType<typeof prisma.item.upsert>>>();
  for (const item of ITEMS) {
    const row = await prisma.item.upsert({ where: { name: item.name }, create: item, update: item });
    itemsByName.set(row.name, row);
  }

  for (const { race, class: className, subclass, background, inventory, ...character } of SEED_CHARACTERS) {
    const raceId = raceIds.get(race);
    const classId = classIds.get(className);
    const backgroundId = backgroundIds.get(background);
    const inventoryItems = inventory.map((row, position) => resolveInventoryRow(row, position, itemsByName));

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
