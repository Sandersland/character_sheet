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
      { id: "i1", name: "Quarterstaff", quantity: 1, weight: 4, equipped: true },
      { id: "i2", name: "Spellbook", quantity: 1, weight: 3 },
      { id: "i3", name: "Component Pouch", quantity: 1, weight: 2, equipped: true },
      {
        id: "i4",
        name: "Ring of Protection",
        quantity: 1,
        equipped: true,
        description: "+1 bonus to AC and saving throws.",
      },
      { id: "i5", name: "Potion of Healing", quantity: 3, weight: 0.5 },
      { id: "i6", name: "Scholar's Pack", quantity: 1, weight: 11 },
      { id: "i7", name: "Ink and Quill", quantity: 1 },
      { id: "i8", name: "Pearl (arcane focus)", quantity: 1, weight: 0.1 },
    ],
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
      { id: "i1", name: "Warhammer", quantity: 1, weight: 2, equipped: true },
      { id: "i2", name: "Shield", quantity: 1, weight: 6, equipped: true },
      { id: "i3", name: "Plate Armor", quantity: 1, weight: 65, equipped: true },
      { id: "i4", name: "Handaxe", quantity: 2, weight: 2 },
      { id: "i5", name: "Healer's Kit", quantity: 1, weight: 3 },
    ],
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
      { id: "i1", name: "Shortsword", quantity: 2, weight: 2, equipped: true },
      { id: "i2", name: "Shortbow", quantity: 1, weight: 2, equipped: true },
      { id: "i3", name: "Thieves' Tools", quantity: 1, weight: 1 },
      { id: "i4", name: "Cloak of Elvenkind", quantity: 1, equipped: true },
    ],
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

  for (const { race, class: className, subclass, background, ...character } of SEED_CHARACTERS) {
    const raceId = raceIds.get(race);
    const classId = classIds.get(className);
    const backgroundId = backgroundIds.get(background);

    await prisma.character.upsert({
      where: { id: character.id },
      create: {
        ...character,
        raceSelection: { create: { name: race, raceId } },
        backgroundSelection: { create: { name: background, backgroundId } },
        classEntries: { create: [{ name: className, subclass, classId, position: 0 }] },
      },
      update: {
        ...character,
        raceSelection: {
          upsert: { create: { name: race, raceId }, update: { name: race, raceId } },
        },
        backgroundSelection: {
          upsert: { create: { name: background, backgroundId }, update: { name: background, backgroundId } },
        },
        // Class entries have no natural unique key to upsert against, so
        // re-seeding replaces them wholesale rather than risking duplicates.
        classEntries: {
          deleteMany: {},
          create: [{ name: className, subclass, classId, position: 0 }],
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
