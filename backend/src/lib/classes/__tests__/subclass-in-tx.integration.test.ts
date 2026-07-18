import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { InvalidClassOperationError, setSubclassInTx } from "@/lib/classes/class.js";

const OWNER_ID = "owner-subclass-in-tx";
const BATCH = "batch-subclass-in-tx";
const FIGHTER_NAME = "InTx Subclass Fighter";
const WIZARD_NAME = "InTx Subclass Wizard";

const BASE_CHAR = {
  name: "Subclass In-Tx Fixture",
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 24, max: 24, temp: 0 },
  hitDice: { total: 3, die: "d10" },
  abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

let fighterId: string;
let wizardId: string;
let battleMasterId: string; // belongs to the fighter (subclassLevel 3)
let evocationId: string; // belongs to the wizard (wrong class for a fighter)

describe("setSubclassInTx (#895 seam)", () => {
  const createdChars: string[] = [];

  beforeAll(async () => {
    await ensureTestOwner(OWNER_ID);
    const fighter = await prisma.characterClass.upsert({
      where: { name: FIGHTER_NAME },
      create: { name: FIGHTER_NAME, hitDie: "d10", savingThrows: ["strength"], skillChoiceCount: 2, skillChoices: ["athletics"], subclassLevel: 3 },
      update: { subclassLevel: 3 },
    });
    const wizard = await prisma.characterClass.upsert({
      where: { name: WIZARD_NAME },
      create: { name: WIZARD_NAME, hitDie: "d6", savingThrows: ["intelligence"], skillChoiceCount: 2, skillChoices: ["arcana"], subclassLevel: 2 },
      update: { subclassLevel: 2 },
    });
    fighterId = fighter.id;
    wizardId = wizard.id;
    const bm = await prisma.subclass.upsert({
      where: { classId_name: { classId: fighterId, name: "Battle Master InTx" } },
      create: { classId: fighterId, name: "Battle Master InTx", description: "Test subclass." },
      update: {},
    });
    const evo = await prisma.subclass.upsert({
      where: { classId_name: { classId: wizardId, name: "Evocation InTx" } },
      create: { classId: wizardId, name: "Evocation InTx", description: "Test subclass." },
      update: {},
    });
    battleMasterId = bm.id;
    evocationId = evo.id;
  });

  afterEach(async () => {
    if (createdChars.length) await prisma.character.deleteMany({ where: { id: { in: createdChars.splice(0) } } });
  });

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: { in: [FIGHTER_NAME, WIZARD_NAME] } } });
  });

  async function fighterAt(experiencePoints: number) {
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        experiencePoints,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "fighter", classId: fighterId, position: 0, level: 3 } },
      },
      include: { classEntries: true },
    });
    createdChars.push(character.id);
    return character;
  }

  it("writes subclassId + name and emits one subclassChosen event under the caller's batchId", async () => {
    const character = await fighterAt(900); // level 3 meets Fighter subclassLevel 3
    const entryId = character.classEntries[0].id;

    await prisma.$transaction((tx) =>
      setSubclassInTx(tx, character.id, { type: "setSubclass", subclassId: battleMasterId }, BATCH, null),
    );

    const entry = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(entry.subclassId).toBe(battleMasterId);
    expect(entry.subclass).toBe("Battle Master InTx");

    const events = await prisma.characterEvent.findMany({
      where: { characterId: character.id, batchId: BATCH },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ category: "class", type: "subclassChosen" });
    expect(events[0].data).toMatchObject({ classEntryId: entryId, subclassId: battleMasterId });
  });

  it("throws for an unknown subclass id", async () => {
    const character = await fighterAt(900);
    await expect(
      prisma.$transaction((tx) =>
        setSubclassInTx(tx, character.id, { type: "setSubclass", subclassId: "does-not-exist" }, BATCH, null),
      ),
    ).rejects.toThrowError(InvalidClassOperationError);
  });

  it("throws when the subclass belongs to a different class", async () => {
    const character = await fighterAt(900);
    await expect(
      prisma.$transaction((tx) =>
        setSubclassInTx(tx, character.id, { type: "setSubclass", subclassId: evocationId }, BATCH, null),
      ),
    ).rejects.toThrowError(InvalidClassOperationError);
  });

  it("throws when the character level is below the subclass-granting level", async () => {
    const character = await fighterAt(0); // level 1, below Fighter subclassLevel 3
    await expect(
      prisma.$transaction((tx) =>
        setSubclassInTx(tx, character.id, { type: "setSubclass", subclassId: battleMasterId }, BATCH, null),
      ),
    ).rejects.toThrowError(InvalidClassOperationError);
  });

  // #1065: the target entry is resolved by the subclass's class, not position 0.
  async function multiclassAt(fighterLevel: number) {
    const character = await prisma.character.create({
      data: {
        ...BASE_CHAR,
        experiencePoints: 6500, // derived total 5; multiclass uses per-entry levels
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [
            { name: "wizard", classId: wizardId, position: 0, level: 3 },
            { name: "fighter", classId: fighterId, position: 1, level: fighterLevel },
          ],
        },
      },
      include: { classEntries: { orderBy: { position: "asc" } } },
    });
    createdChars.push(character.id);
    return character;
  }

  it("writes the subclass onto a NON-primary entry of the subclass's class", async () => {
    const character = await multiclassAt(3);
    const [primary, secondary] = character.classEntries;

    await prisma.$transaction((tx) =>
      setSubclassInTx(tx, character.id, { type: "setSubclass", subclassId: battleMasterId }, BATCH, null),
    );

    const after = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: secondary.id } });
    expect(after.subclassId).toBe(battleMasterId);
    const untouchedPrimary = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: primary.id } });
    expect(untouchedPrimary.subclassId).toBeNull();
  });

  it("throws when the NON-primary entry's class level is below the grant level", async () => {
    const character = await multiclassAt(2); // fighter 2 < subclassLevel 3 (derived total 5 must NOT mask this)
    await expect(
      prisma.$transaction((tx) =>
        setSubclassInTx(tx, character.id, { type: "setSubclass", subclassId: battleMasterId }, BATCH, null),
      ),
    ).rejects.toThrowError(InvalidClassOperationError);
  });
});
