// A fixture class with two StartingEquipmentPackage rows whose content genuinely differs between editions proves character-create.ts resolves (classId, edition), not classId alone (#1534).
// This fixture class name is safe from assertEveryClassEditionHasPackage — that guard only checks the real seed literals, and this test never calls the seeder.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-starting-equipment-edition";
let COOKIE: string;

const FIXTURE_CLASS = {
  name: "Zzz Fixture Package Class (#1534)",
  hitDie: "d8",
  savingThrows: ["dexterity"],
  skillChoiceCount: 0,
  skillChoices: [] as string[],
  isSpellcaster: false,
};

// Deliberately non-overlapping gold ranges and distinct fixed items so a cross-edition mixup is impossible to mistake for a coincidence.
const PACKAGE_2014 = {
  gold: { diceCount: 1, diceFaces: 4, multiplier: 10 }, // 10-40
  itemName: "2014 fixture gear",
  catalogName: "Dagger",
};
const PACKAGE_2024 = {
  gold: { diceCount: 9, diceFaces: 4, multiplier: 10 }, // 90-360
  itemName: "2024 fixture gear",
  catalogName: "Handaxe",
};

let fixtureClassId: string;
const createdCharacterIds: string[] = [];

async function createPackage(
  edition: "EDITION_2014" | "EDITION_2024",
  spec: typeof PACKAGE_2014,
): Promise<void> {
  await prisma.startingEquipmentPackage.create({
    data: {
      classId: fixtureClassId,
      name: FIXTURE_CLASS.name,
      edition,
      goldDiceCount: spec.gold.diceCount,
      goldDiceFaces: spec.gold.diceFaces,
      goldMultiplier: spec.gold.multiplier,
      groups: {
        create: [
          {
            position: 0,
            label: spec.itemName,
            options: {
              create: [
                {
                  position: 0,
                  label: spec.itemName,
                  items: { create: [{ position: 0, catalogName: spec.catalogName }] },
                },
              ],
            },
          },
        ],
      },
    },
  });
}

async function baseBody(edition: "EDITION_2014" | "EDITION_2024") {
  const anchor = await seededSpeciesAnchor(edition);
  return {
    name: `Fixture Character ${edition}`,
    alignment: "True Neutral",
    ...anchor,
    background: "Soldier",
    classes: [{ name: FIXTURE_CLASS.name }],
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    skillProficiencies: [] as string[],
    rulesEdition: edition,
  };
}

describe("character creation resolves StartingEquipmentPackage by (classId, edition) (#1534)", () => {
  beforeAll(async () => {
    const cls = await prisma.characterClass.upsert({
      where: { name: FIXTURE_CLASS.name },
      create: FIXTURE_CLASS,
      update: FIXTURE_CLASS,
    });
    fixtureClassId = cls.id;
    await createPackage("EDITION_2014", PACKAGE_2014);
    await createPackage("EDITION_2024", PACKAGE_2024);
    COOKIE = await authCookie(OWNER_ID);
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: { in: createdCharacterIds } } });
    // Cascades to the package's groups/options/items (onDelete: Cascade).
    await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS.name } });
  });

  it("package mode: a 2014 character gets the 2014 package's item, not the 2024 one", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({ ...(await baseBody("EDITION_2014")), startingEquipment: { mode: "package", selections: [{ optionIndex: 0 }] } });

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);
    const names: string[] = response.body.inventory.map((i: { name: string }) => i.name);
    expect(names).toContain("Dagger");
    expect(names).not.toContain("Handaxe");
  });

  it("package mode: a 2024 character gets the 2024 package's item, not the 2014 one", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({ ...(await baseBody("EDITION_2024")), startingEquipment: { mode: "package", selections: [{ optionIndex: 0 }] } });

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);
    const names: string[] = response.body.inventory.map((i: { name: string }) => i.name);
    expect(names).toContain("Handaxe");
    expect(names).not.toContain("Dagger");
  });

  it("gold mode: the same gold amount is valid for 2014 but rejected for 2024 (disjoint dice ranges)", async () => {
    const in2014Range = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({ ...(await baseBody("EDITION_2014")), startingEquipment: { mode: "gold", gold: 25 } });
    expect(in2014Range.status).toBe(201);
    createdCharacterIds.push(in2014Range.body.id);

    const same2024 = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({ ...(await baseBody("EDITION_2024")), startingEquipment: { mode: "gold", gold: 25 } });
    expect(same2024.status).toBe(400);
  });
});
