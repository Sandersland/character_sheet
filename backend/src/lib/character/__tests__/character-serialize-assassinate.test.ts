import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

const OWNER_ID = "owner-serialize-assassinate";
const CATALOG_CLASS_NAME = "Serialize Assassinate Test Rogue";
const CHAR_IDS = [
  "assassinate-2014-l3",
  "assassinate-2014-l2",
  "assassinate-2014-thief",
  "assassinate-2024-l3",
];

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

const BASE = {
  ownerId: OWNER_ID,
  alignment: "Neutral",
  initiativeBonus: 0,
  speed: 30,
  savingThrowProficiencies: [] as string[],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  hitPoints: { current: 10, max: 10, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
};

let rogueClassId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  const cls = await prisma.characterClass.upsert({
    where: { name: CATALOG_CLASS_NAME },
    create: {
      name: CATALOG_CLASS_NAME,
      hitDie: "d8",
      savingThrows: ["dexterity", "intelligence"],
      skillChoiceCount: 4,
      skillChoices: ["stealth"],
    },
    update: {},
  });
  rogueClassId = cls.id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
  await prisma.characterClass.deleteMany({ where: { name: CATALOG_CLASS_NAME } });
});

function rogueCharacter(id: string, level: number, subclass: string, rulesEdition: "EDITION_2014" | "EDITION_2024") {
  return prisma.character.create({
    data: {
      ...BASE,
      id,
      name: `Assassinate Fixture (${id})`,
      rulesEdition,
      experiencePoints: 0,
      hitDice: { total: level, die: "d8", spent: 0 },
      classEntries: {
        create: [{ name: "rogue", position: 0, level, subclass, classId: rogueClassId }],
      },
    },
  });
}

describe("serializeCharacter assassinate rider (#1526)", () => {
  it("a 2014 Assassin at L3 gets the assassinate rider", async () => {
    await rogueCharacter("assassinate-2014-l3", 3, "Assassin", "EDITION_2014");
    expect((await serialize("assassinate-2014-l3")).assassinate).toBe(true);
  });

  it("a 2014 Assassin below L3 gets no rider", async () => {
    await rogueCharacter("assassinate-2014-l2", 2, "Assassin", "EDITION_2014");
    expect((await serialize("assassinate-2014-l2")).assassinate).toBeUndefined();
  });

  it("a 2014 Thief (non-Assassin rogue) at L3 gets no rider", async () => {
    await rogueCharacter("assassinate-2014-thief", 3, "Thief", "EDITION_2014");
    expect((await serialize("assassinate-2014-thief")).assassinate).toBeUndefined();
  });

  it("a 2024 Assassin at L3 gets NO rider — SRD 5.2/PHB'24 deleted the auto-crit clause", async () => {
    await rogueCharacter("assassinate-2024-l3", 3, "Assassin", "EDITION_2024");
    expect((await serialize("assassinate-2024-l3")).assassinate).toBeUndefined();
  });
});
