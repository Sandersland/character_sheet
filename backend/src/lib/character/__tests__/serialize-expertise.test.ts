// #1588: clamp-on-read + skills[].expertise wire flag. A rogue's chosen
// expertiseKnown skills set expertise:true on exactly those skills; storage
// exceeding the level-derived expertiseChoiceCount (a level-down that hasn't
// been reconciled yet) clamps on read, mirroring toolProficienciesKnown's own
// clamp-on-read contract (character-serialize-snapshot.test.ts).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

const OWNER_ID = "owner-serialize-expertise";
const CHAR_IDS = ["expertise-rogue-l6", "expertise-rogue-l1-overcap"];

const SKILLS = [
  { name: "stealth", ability: "dexterity", proficient: true },
  { name: "perception", ability: "wisdom", proficient: true },
  { name: "acrobatics", ability: "dexterity", proficient: true },
  { name: "athletics", ability: "strength", proficient: true },
  { name: "arcana", ability: "intelligence", proficient: false },
];

const EXPERTISE_KNOWN = [
  { id: "ex1", skill: "stealth" },
  { id: "ex2", skill: "perception" },
  { id: "ex3", skill: "acrobatics" },
  { id: "ex4", skill: "athletics" },
];

let rogueClassId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  rogueClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Rogue" } })).id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
});

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

describe("skills[].expertise + resources.expertiseKnown clamp-on-read (#1588)", () => {
  it("sets expertise:true on exactly the chosen skills at L6 (cap 4)", async () => {
    await prisma.character.create({
      data: {
        id: "expertise-rogue-l6",
        name: "Expertise Rogue",
        ownerId: OWNER_ID,
        alignment: "Chaotic Neutral",
        rulesEdition: "EDITION_2014",
        experiencePoints: 14000, // level 6
        initiativeBonus: 0,
        speed: 30,
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 12, charisma: 10 },
        savingThrowProficiencies: [],
        skills: SKILLS,
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 6, die: "d8", spent: 0 },
        resources: { expertiseKnown: EXPERTISE_KNOWN },
        classEntries: { create: [{ name: "rogue", classId: rogueClassId, position: 0, level: 6 }] },
      },
    });

    const payload = await serialize("expertise-rogue-l6");
    const bySkill = new Map(payload.skills.map((s) => [s.name, s]));

    expect(bySkill.get("stealth")?.expertise).toBe(true);
    expect(bySkill.get("perception")?.expertise).toBe(true);
    expect(bySkill.get("acrobatics")?.expertise).toBe(true);
    expect(bySkill.get("athletics")?.expertise).toBe(true);
    expect(bySkill.get("arcana")?.expertise).toBeFalsy();
    expect(payload.skills.filter((s) => s.expertise).length).toBe(4);
    expect((payload.resources as { expertiseChoiceCount?: number }).expertiseChoiceCount).toBe(4);
  });

  it("clamps stored expertiseKnown to the level-derived cap on read (L1 cap 2, 4 stored)", async () => {
    await prisma.character.create({
      data: {
        id: "expertise-rogue-l1-overcap",
        name: "Expertise Rogue Overcap",
        ownerId: OWNER_ID,
        alignment: "Chaotic Neutral",
        rulesEdition: "EDITION_2014",
        experiencePoints: 0, // level 1
        initiativeBonus: 0,
        speed: 30,
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 12, charisma: 10 },
        savingThrowProficiencies: [],
        skills: SKILLS,
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        hitPoints: { current: 10, max: 10, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 1, die: "d8", spent: 0 },
        // Stored as if reconciliation hasn't run yet (a level-down from L6->L1).
        resources: { expertiseKnown: EXPERTISE_KNOWN },
        classEntries: { create: [{ name: "rogue", classId: rogueClassId, position: 0, level: 1 }] },
      },
    });

    const payload = await serialize("expertise-rogue-l1-overcap");
    expect(payload.skills.filter((s) => s.expertise).length).toBe(2);
    // Read-clamp keeps the FIRST entries (LIFO drop), same as toolProficienciesKnown.
    const bySkill = new Map(payload.skills.map((s) => [s.name, s]));
    expect(bySkill.get("stealth")?.expertise).toBe(true);
    expect(bySkill.get("perception")?.expertise).toBe(true);
    expect(bySkill.get("acrobatics")?.expertise).toBeFalsy();
    expect(bySkill.get("athletics")?.expertise).toBeFalsy();
    expect((payload.resources as { expertiseChoiceCount?: number }).expertiseChoiceCount).toBe(2);
  });
});
