// Rider contract (#1316): sneakAttack/stunningStrike/openHandTechnique/quiveringPalm/maneuvers are emitted only when the character has them — absent, never null.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { QUIVERING_PALM_BUFF_KEY } from "@/lib/classes/quivering-palm.js";

const OWNER_ID = "owner-serialize-riders";
const CHAR_IDS = [
  "riders-battle-master-l7",
  "riders-rogue-l3",
  "riders-monk-l4",
  "riders-monk-l5",
  "riders-open-hand-l2",
  "riders-open-hand-l3",
  "riders-open-hand-l16",
  "riders-open-hand-l17",
  "riders-shadow-l17",
  "riders-open-handbook-l17",
  "riders-no-classes",
  "riders-rogue3-monk5",
  "riders-way-open-hand-l17",
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
};

let fighterClassId: string;
let battleMasterSubclassId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  // maneuverChoiceCount/announcedSaveDC are ROW-driven and need the real FK relations (classId/subclassId) to the seeded Fighter/Battle Master catalog, not a bespoke Subclass row.
  fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } })).id;
  battleMasterSubclassId = (await prisma.subclass.findFirstOrThrow({ where: { classId: fighterClassId, name: "Battle Master" } })).id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
});

describe("serializeCharacter rider contract (#1316)", () => {
  it("a level-7 Battle Master Fighter carries no monk/rogue rider keys", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-battle-master-l7",
        name: "Battle Master Snapshot",
        experiencePoints: 23000,
        hitDice: { total: 7, die: "d10", spent: 7 },
        abilityScores: { strength: 16, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
        classEntries: { create: [{ name: "fighter", position: 0, level: 7, subclass: "battle master", classId: fighterClassId, subclassId: battleMasterSubclassId }] },
      },
    });
    const payload = await serialize("riders-battle-master-l7");

    expect(payload).not.toHaveProperty("sneakAttack");
    expect(payload).not.toHaveProperty("stunningStrike");
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");

    // announcedSaveDC folds into the top-level maneuvers rider, named for the feature like every other rider.
    expect(payload).toHaveProperty("maneuvers", { saveDC: 14 });
    // maneuverChoiceCount/toolProfChoiceCount stay put in resources (#1316) — only the save DC moved out.
    expect((payload.resources as { maneuverChoiceCount?: number }).maneuverChoiceCount).toBe(5);
    expect(payload.resources).not.toHaveProperty("announcedSaveDC");
  });

  it("a rogue's sneak-attack dice are still correct, with no other rider keys", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-rogue-l3",
        name: "Rogue Snapshot",
        experiencePoints: 900,
        hitDice: { total: 3, die: "d8", spent: 3 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
        classEntries: { create: [{ name: "rogue", position: 0, level: 3 }] },
      },
    });
    const payload = await serialize("riders-rogue-l3");

    expect(payload.sneakAttack).toEqual({ dice: { count: 2, faces: 6 } });
    expect(payload).not.toHaveProperty("stunningStrike");
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");
    expect(payload).not.toHaveProperty("maneuvers");
  });

  it("a base monk below level 5 has no Stunning Strike (one below the gate)", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-monk-l4",
        name: "Monk L4 Snapshot",
        experiencePoints: 2700,
        hitDice: { total: 4, die: "d8", spent: 4 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 4 }] },
      },
    });
    const payload = await serialize("riders-monk-l4");
    expect(payload).not.toHaveProperty("stunningStrike");
  });

  it("a monk's Stunning Strike DC is correct exactly at the L5 gate", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-monk-l5",
        name: "Monk L5 Snapshot",
        experiencePoints: 6500,
        hitDice: { total: 5, die: "d8", spent: 5 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 5 }] },
      },
    });
    const payload = await serialize("riders-monk-l5");

    expect(payload.stunningStrike).toEqual({ saveDC: 14 });
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");
    expect(payload).not.toHaveProperty("sneakAttack");
  });

  it("an Open Hand monk one level below L3 has no Open Hand Technique", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-open-hand-l2",
        name: "Open Hand L2 Snapshot",
        experiencePoints: 300,
        hitDice: { total: 2, die: "d8", spent: 2 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 2, subclass: "Warrior of the Open Hand" }] },
      },
    });
    const payload = await serialize("riders-open-hand-l2");
    expect(payload).not.toHaveProperty("openHandTechnique");
  });

  it("an Open Hand monk's Open Hand Technique DC is correct exactly at the L3 gate (Stunning Strike still absent)", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-open-hand-l3",
        name: "Open Hand L3 Snapshot",
        experiencePoints: 900,
        hitDice: { total: 3, die: "d8", spent: 3 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 3, subclass: "Warrior of the Open Hand" }] },
      },
    });
    const payload = await serialize("riders-open-hand-l3");

    expect(payload.openHandTechnique).toEqual({ saveDC: 13 });
    expect(payload).not.toHaveProperty("stunningStrike");
    expect(payload).not.toHaveProperty("quiveringPalm");
  });

  it("an Open Hand monk one level below L17 has no Quivering Palm", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-open-hand-l16",
        name: "Open Hand L16 Snapshot",
        experiencePoints: 195000,
        hitDice: { total: 16, die: "d8", spent: 16 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 16, subclass: "Warrior of the Open Hand" }] },
      },
    });
    const payload = await serialize("riders-open-hand-l16");
    expect(payload).not.toHaveProperty("quiveringPalm");
  });

  it("an Open Hand monk's Quivering Palm DC + active state are correct exactly at the L17 gate", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-open-hand-l17",
        name: "Open Hand L17 Snapshot",
        experiencePoints: 225000,
        hitDice: { total: 17, die: "d8", spent: 17 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 17, subclass: "Warrior of the Open Hand" }] },
        activeEffects: {
          buffs: [
            { id: "buff-qp", key: QUIVERING_PALM_BUFF_KEY, target: QUIVERING_PALM_BUFF_KEY, modifier: 0, source: "Quivering Palm", duration: "while-active" },
          ],
        },
      },
    });
    const payload = await serialize("riders-open-hand-l17");

    expect(payload.quiveringPalm).toEqual({ saveDC: 17, active: true });
  });

  it("a level-17 monk of a different subclass has no Open Hand riders", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-shadow-l17",
        name: "Shadow L17 Snapshot",
        experiencePoints: 225000,
        hitDice: { total: 17, die: "d8", spent: 17 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 17, subclass: "Warrior of Shadow" }] },
      },
    });
    const payload = await serialize("riders-shadow-l17");
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");
    expect(payload.stunningStrike).toEqual({ saveDC: 17 });
  });

  // Regression guard: a homebrew name merely CONTAINING "Open Hand" must not surface either rider (#1277).
  it('a level-17 monk named "Way of the Open Handbook" has neither Open Hand rider', async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-open-handbook-l17",
        name: "Open Handbook L17 Snapshot",
        experiencePoints: 225000,
        hitDice: { total: 17, die: "d8", spent: 17 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 17, subclass: "Way of the Open Handbook" }] },
      },
    });
    const payload = await serialize("riders-open-handbook-l17");
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");
  });

  it("a character with zero class entries carries no rider keys at all", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-no-classes",
        name: "Classless Snapshot",
        experiencePoints: 0,
        hitDice: { total: 0, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        classEntries: { create: [] },
      },
    });
    const payload = await serialize("riders-no-classes");

    expect(payload).not.toHaveProperty("sneakAttack");
    expect(payload).not.toHaveProperty("stunningStrike");
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");
    expect(payload).not.toHaveProperty("maneuvers");
  });

  // Way of the Open Hand (2014) is a SEPARATE subclass from Warrior of the Open Hand (2024) — openHandMonkEntry must recognize both slugs (#1501).
  it("a 2014 Way of the Open Hand monk carries both Open Hand riders, same as its 2024 counterpart", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-way-open-hand-l17",
        name: "Way of the Open Hand L17 Snapshot",
        rulesEdition: "EDITION_2014",
        experiencePoints: 225000,
        hitDice: { total: 17, die: "d8", spent: 17 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 17, subclass: "Way of the Open Hand" }] },
      },
    });
    const payload = await serialize("riders-way-open-hand-l17");

    // The ki/focus save DC formula is edition-invariant (monkSaveDC).
    expect(payload.openHandTechnique).toEqual({ saveDC: 17 });
    expect(payload.quiveringPalm).toEqual({ saveDC: 17, active: false });
  });

  it("a Rogue 3 / Monk 5 multiclass carries both riders, each gated on its own entry's level", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-rogue3-monk5",
        name: "Rogue3Monk5 Snapshot",
        experiencePoints: 34000,
        hitDice: { total: 8, die: "d8", spent: 8 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: {
          create: [
            { name: "rogue", position: 0, level: 3 },
            { name: "monk", position: 1, level: 5 },
          ],
        },
      },
    });
    const payload = await serialize("riders-rogue3-monk5");

    expect(payload.sneakAttack).toEqual({ dice: { count: 2, faces: 6 } });
    expect(payload.stunningStrike).toEqual({ saveDC: 14 });
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");
    expect(payload).not.toHaveProperty("maneuvers");
  });
});
