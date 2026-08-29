import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";
import { seededSpeciesId } from "@/test-support/species.js";

const TEST_USER = { id: "test-user-1", email: "fixture-owner@test.local" };
let COOKIE: string;
const TEST_RACE = { name: "Test Race", speed: 30 };
const TEST_SPECIES = { name: TEST_RACE.name, slug: "zzz-fixture-characters-test", speed: TEST_RACE.speed, edition: "EDITION_2024" as const };
let testSpeciesId: string;
const TEST_CLASS = {
  name: "Test Class",
  hitDie: "d10",
  savingThrows: ["strength"],
  skillChoiceCount: 2,
  skillChoices: ["athletics", "perception"],
  isSpellcaster: false,
};
const TEST_BACKGROUND = { name: "Test Background", skillProficiencies: ["athletics"] };
const TEST_ITEM = {
  name: "Test Club",
  category: "weapon" as const,
  weight: 2,
  cost: { cp: 0, sp: 1, gp: 0, pp: 0 },
  scopeKey: "global",
};
const TEST_ITEM_WEAPON_DETAIL = {
  damageDiceCount: 1,
  damageDiceFaces: 4,
  damageType: "bludgeoning",
  light: true,
};

const FIXTURE = {
  id: "test-character-1",
  name: "Test Fixture",
  alignment: "Lawful Good",
  experiencePoints: 1000,
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d10" },
  abilityScores: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  savingThrowProficiencies: ["strength"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("characters routes", () => {
  let createdCharacterIds: string[] = [];

  beforeEach(async () => {
    await prisma.user.upsert({
      where: { id: TEST_USER.id },
      create: TEST_USER,
      update: TEST_USER,
    });
    COOKIE = await authCookie(TEST_USER.id);
    // Sequential upserts, not Promise.all — mirrors charactersRouter's POST handler ordering.
    const species = await prisma.species.upsert({
      where: { slug_edition: { slug: TEST_SPECIES.slug, edition: TEST_SPECIES.edition } },
      create: TEST_SPECIES,
      update: TEST_SPECIES,
    });
    testSpeciesId = species.id;
    const characterClass = await prisma.characterClass.upsert({
      where: { name: TEST_CLASS.name },
      create: TEST_CLASS,
      update: TEST_CLASS,
    });
    const background = await upsertEditionRow(
      prisma.background,
      { name: TEST_BACKGROUND.name, edition: null },
      TEST_BACKGROUND,
      TEST_BACKGROUND,
    );
    const item = await prisma.item.upsert({
      where: { scopeKey_name: { scopeKey: "global", name: TEST_ITEM.name } },
      create: { ...TEST_ITEM, weaponDetail: { create: TEST_ITEM_WEAPON_DETAIL } },
      update: {
        ...TEST_ITEM,
        weaponDetail: { upsert: { create: TEST_ITEM_WEAPON_DETAIL, update: TEST_ITEM_WEAPON_DETAIL } },
      },
    });

    await prisma.character.create({
      data: {
        ...FIXTURE,
        owner: { connect: { id: TEST_USER.id } },
        spellcasting: Prisma.JsonNull,
        raceSelection: { create: { name: species.name, speciesId: species.id } },
        backgroundSelection: { create: { name: background.name, backgroundId: background.id } },
        classEntries: {
          create: [{ name: characterClass.name, classId: characterClass.id, position: 0 }],
        },
      },
    });
    await prisma.inventoryItem.create({
      data: {
        ...inventoryItemFixtureData({
          characterId: FIXTURE.id,
          name: item.name,
          category: item.category,
          weight: item.weight,
          cost: TEST_ITEM.cost,
          equippedSlot: "MAIN_HAND",
          position: 0,
          weapon: TEST_ITEM_WEAPON_DETAIL,
        }),
        itemId: item.id,
      },
    });
    await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId: FIXTURE.id,
        name: "Homebrew Amulet",
        category: "gear",
        description: "A custom magic item with no catalog entry.",
        position: 1,
      }),
    });

    createdCharacterIds = [FIXTURE.id];
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: { in: createdCharacterIds } } });
  });

  // Catalog rows are upserted (not deleted) between tests to keep ids stable across reruns; deleted here so they don't leak into a later file sharing this worker's database.
  afterAll(async () => {
    await prisma.species.deleteMany({ where: { slug: TEST_SPECIES.slug } });
    await prisma.characterClass.deleteMany({ where: { name: TEST_CLASS.name } });
    await prisma.background.deleteMany({ where: { name: TEST_BACKGROUND.name } });
    await prisma.item.deleteMany({ where: { name: TEST_ITEM.name } });
    await prisma.user.deleteMany({ where: { id: TEST_USER.id } });
  });

  it("GET /api/characters returns exactly this suite's fixtures, name-ordered", async () => {
    const secondId = "test-character-2";
    createdCharacterIds.push(secondId);
    await prisma.character.create({
      data: {
        ...FIXTURE,
        id: secondId,
        name: "Aardvark Fixture",
        owner: { connect: { id: TEST_USER.id } },
        spellcasting: Prisma.JsonNull,
        raceSelection: { create: { name: TEST_RACE.name } },
        backgroundSelection: { create: { name: TEST_BACKGROUND.name } },
        classEntries: { create: [{ name: TEST_CLASS.name, position: 0 }] },
      },
    });

    const response = await supertest.agent(app).set("Cookie", COOKIE).get("/api/characters");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({ id: secondId, name: "Aardvark Fixture" }),
      expect.objectContaining({
        id: FIXTURE.id,
        name: "Test Fixture",
        level: 3,
        ownerId: TEST_USER.id,
      }),
    ]);
    // Deliberately unscoped whole-table count — a leak detector, only assertable because each worker has its own database (#1269).
    expect(await prisma.character.count()).toBe(2);
  });

  it("GET /api/characters/:id returns full character with derived fields", async () => {
    const response = await supertest.agent(app).set("Cookie", COOKIE).get(
      `/api/characters/${FIXTURE.id}`
    );

    expect(response.status).toBe(200);
    expect(response.body.level).toBe(3);
    expect(response.body.proficiencyBonus).toBe(2);
    expect(response.body.currentLevelThreshold).toBe(900);
    expect(response.body.nextLevelThreshold).toBe(2700);
    expect(response.body.experiencePoints).toBe(1000);
    expect(response.body.race).toBe(TEST_RACE.name);
    expect(response.body.class).toBe(TEST_CLASS.name);
    expect(response.body.background).toBe(TEST_BACKGROUND.name);
    expect(response.body.ownerId).toBe(TEST_USER.id);

    expect(response.body.inventory).toHaveLength(2);
    const [catalogRow, homebrewRow] = response.body.inventory;
    expect(catalogRow).toMatchObject({
      name: TEST_ITEM.name,
      category: "weapon",
      quantity: 1,
      equipped: true,
      weapon: {
        damageDiceCount: 1,
        damageDiceFaces: 4,
        damageType: "bludgeoning",
        light: true,
      },
    });
    expect(catalogRow.armor).toBeUndefined();
    expect(catalogRow.consumable).toBeUndefined();
    expect(typeof catalogRow.itemId).toBe("string");
    expect(homebrewRow).toMatchObject({
      name: "Homebrew Amulet",
      category: "gear",
      description: "A custom magic item with no catalog entry.",
      quantity: 1,
      equipped: false,
    });
    expect(homebrewRow.itemId).toBeUndefined();
  });

  it("GET /api/characters/:id 404s for unknown id", async () => {
    const response = await supertest.agent(app).set("Cookie", COOKIE).get(
      "/api/characters/does-not-exist"
    );

    expect(response.status).toBe(404);
  });

  describe("Barbarian Fast Movement speed derivation", () => {
    const makeAndGetSpeed = async (
      classEntries: { name: string; level: number }[],
      equippedArmorCategory?: "light" | "medium" | "heavy" | "shield",
    ): Promise<number> => {
      const id = `fast-move-${randomUUID()}`;
      createdCharacterIds.push(id);
      await prisma.character.create({
        data: {
          ...FIXTURE,
          id,
          name: id,
          speed: 30,
          experiencePoints: 14000, // well past level 5; irrelevant to class-level gating
          owner: { connect: { id: TEST_USER.id } },
          spellcasting: Prisma.JsonNull,
          raceSelection: { create: { name: TEST_RACE.name } },
          backgroundSelection: { create: { name: TEST_BACKGROUND.name } },
          classEntries: {
            create: classEntries.map((e, i) => ({ name: e.name, level: e.level, position: i })),
          },
        },
      });
      if (equippedArmorCategory) {
        await prisma.inventoryItem.create({
          data: inventoryItemFixtureData({
            characterId: id,
            name: `${equippedArmorCategory} armor`,
            category: "armor",
            equippedSlot: equippedArmorCategory === "shield" ? "OFF_HAND" : "BODY",
            position: 0,
            armor: {
              armorCategory: equippedArmorCategory,
              baseArmorClass: equippedArmorCategory === "shield" ? 2 : 14,
            },
          }),
        });
      }
      const response = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${id}`);
      expect(response.status).toBe(200);
      return response.body.speed;
    };

    it("level-4 barbarian: speed unchanged", async () => {
      expect(await makeAndGetSpeed([{ name: "Barbarian", level: 4 }])).toBe(30);
    });

    it("level-5 barbarian, no armor: base + 10", async () => {
      expect(await makeAndGetSpeed([{ name: "Barbarian", level: 5 }])).toBe(40);
    });

    it("level-5 barbarian, light armor: base + 10", async () => {
      expect(await makeAndGetSpeed([{ name: "Barbarian", level: 5 }], "light")).toBe(40);
    });

    it("level-5 barbarian, medium armor: base + 10", async () => {
      expect(await makeAndGetSpeed([{ name: "Barbarian", level: 5 }], "medium")).toBe(40);
    });

    it("level-5 barbarian, heavy armor: no bonus", async () => {
      expect(await makeAndGetSpeed([{ name: "Barbarian", level: 5 }], "heavy")).toBe(30);
    });

    it("level-5 barbarian with a shield (no body armor): base + 10", async () => {
      expect(await makeAndGetSpeed([{ name: "Barbarian", level: 5 }], "shield")).toBe(40);
    });

    it("level-20 barbarian: no scaling beyond +10", async () => {
      expect(await makeAndGetSpeed([{ name: "Barbarian", level: 20 }])).toBe(40);
    });

    it("non-barbarian (Fighter) of any level: no bonus", async () => {
      expect(await makeAndGetSpeed([{ name: "Fighter", level: 20 }])).toBe(30);
    });

    it("multiclass Fighter 4 / Barbarian 5, no heavy armor: base + 10", async () => {
      expect(
        await makeAndGetSpeed([
          { name: "Fighter", level: 4 },
          { name: "Barbarian", level: 5 },
        ]),
      ).toBe(40);
    });

    it("multiclass Fighter 5 / Barbarian 4: no bonus", async () => {
      expect(
        await makeAndGetSpeed([
          { name: "Fighter", level: 5 },
          { name: "Barbarian", level: 4 },
        ]),
      ).toBe(30);
    });
  });

  it("POST /api/characters/:id/experience sets XP and recomputes level", async () => {
    const response = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE.id}/experience`)
      .send({ operations: [{ type: "set", value: 6500 }] });

    expect(response.status).toBe(200);
    expect(response.body.experiencePoints).toBe(6500);
    expect(response.body.level).toBe(5);
    expect(response.body.proficiencyBonus).toBe(3);
  });

  it("PATCH rejects attempts to set level directly", async () => {
    const response = await supertest.agent(app).set("Cookie", COOKIE)
      .patch(`/api/characters/${FIXTURE.id}`)
      .send({ level: 99 });

    expect(response.status).toBe(400);
  });

  it("PATCH rejects negative experiencePoints", async () => {
    const response = await supertest.agent(app).set("Cookie", COOKIE)
      .patch(`/api/characters/${FIXTURE.id}`)
      .send({ experiencePoints: -5 });

    expect(response.status).toBe(400);
  });

  it("PATCH rejects attempts to set race/class/background directly", async () => {
    const response = await supertest.agent(app).set("Cookie", COOKIE)
      .patch(`/api/characters/${FIXTURE.id}`)
      .send({ race: "Human" });

    expect(response.status).toBe(400);
  });

  // portraitUrl is read-only, derived from Character.portraitKey — a client-supplied URL was an IDOR (#1615).
  describe("portrait wire seam (#1615)", () => {
    it.each([
      ["set", "https://example.com/p.jpg"],
      ["clear", null],
    ])("PATCH rejects portraitUrl (%s) via .strict() with 400", async (_label, portraitUrl) => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .patch(`/api/characters/${FIXTURE.id}`)
        .send({ portraitUrl });

      expect(response.status).toBe(400);
    });

    it("derives portraitUrl from the stored key on both detail and summary, never exposing the key", async () => {
      const version = "0f8fad5b-d9cb-469f-a165-70867728950e";
      const key = `portraits/characters/${FIXTURE.id}/${version}.webp`;
      await prisma.character.update({ where: { id: FIXTURE.id }, data: { portraitKey: key } });

      const expectedUrl = `/api/characters/${FIXTURE.id}/portrait?v=${version}`;
      const detail = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.portraitUrl).toBe(expectedUrl);
      expect(JSON.stringify(detail.body)).not.toContain(key);

      const list = await supertest.agent(app).set("Cookie", COOKIE).get("/api/characters");
      expect(list.status).toBe(200);
      expect(list.body[0].portraitUrl).toBe(expectedUrl);
      expect(JSON.stringify(list.body)).not.toContain(key);
    });

    it("omits portraitUrl when no portrait is stored", async () => {
      const detail = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.portraitUrl).toBeUndefined();
    });
  });

  it("PATCH 404s for unknown id", async () => {
    const response = await supertest.agent(app).set("Cookie", COOKIE)
      .patch("/api/characters/does-not-exist")
      .send({ currency: { cp: 0, sp: 0, gp: 1, pp: 0 } });

    expect(response.status).toBe(404);
  });

  describe("POST /api/characters", () => {
    // A function, not a const — speciesId isn't known until the outer beforeEach's upsert runs, so each call reads the CURRENT testSpeciesId.
    const createBody = () => ({
      name: "New Hero",
      alignment: "Lawful Good",
      speciesId: testSpeciesId,
      background: TEST_BACKGROUND.name,
      classes: [{ name: TEST_CLASS.name }],
      abilityScores: {
        strength: 15,
        dexterity: 12,
        constitution: 14,
        intelligence: 8,
        wisdom: 10,
        charisma: 8,
      },
      skillProficiencies: ["athletics", "perception"],
    });

    it("creates a character and derives mechanical fields from the catalog", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send(createBody());

      expect(response.status).toBe(201);
      createdCharacterIds.push(response.body.id);

      expect(response.body).toMatchObject({
        name: "New Hero",
        race: TEST_RACE.name,
        class: TEST_CLASS.name,
        background: TEST_BACKGROUND.name,
        level: 1,
        proficiencyBonus: 2,
        experiencePoints: 0,
        speed: TEST_RACE.speed,
        hitDice: { total: 1, die: "d10" },
        hitPoints: { current: 12, max: 12, temp: 0 },
        armorClass: 11,
        initiativeBonus: 1,
        savingThrowProficiencies: ["strength"],
        inventory: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        journal: [],
      });
      expect(response.body.spellcasting).toBeUndefined();

      const athletics = response.body.skills.find((s: { name: string }) => s.name === "athletics");
      const perception = response.body.skills.find((s: { name: string }) => s.name === "perception");
      const stealth = response.body.skills.find((s: { name: string }) => s.name === "stealth");
      expect(athletics).toMatchObject({ proficient: true });
      expect(perception).toMatchObject({ proficient: true });
      expect(stealth).toMatchObject({ proficient: false });
      expect(response.body.skills).toHaveLength(18);
    });

    it("persists the race/background/class as cascade-deleted selection rows", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send(createBody());

      expect(response.status).toBe(201);
      const id = response.body.id;
      createdCharacterIds.push(id);

      await expect(prisma.characterRace.findUnique({ where: { characterId: id } })).resolves.not.toBeNull();
      await expect(prisma.characterBackground.findUnique({ where: { characterId: id } })).resolves.not.toBeNull();
      await expect(prisma.characterClassEntry.findMany({ where: { characterId: id } })).resolves.toHaveLength(1);

      await prisma.character.delete({ where: { id } });

      await expect(prisma.characterRace.findUnique({ where: { characterId: id } })).resolves.toBeNull();
      await expect(prisma.characterBackground.findUnique({ where: { characterId: id } })).resolves.toBeNull();
      await expect(prisma.characterClassEntry.findMany({ where: { characterId: id } })).resolves.toHaveLength(0);

      createdCharacterIds = createdCharacterIds.filter((existingId) => existingId !== id);
    });

    it("rejects portraitUrl in the create payload with 400 (#1616)", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send({ ...createBody(), portraitUrl: "https://example.com/p.jpg" });

      expect(response.status).toBe(400);
    });

    it("allows a homebrew background with no catalog match", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send({ ...createBody(), background: "Wandering Storyteller" });

      expect(response.status).toBe(201);
      createdCharacterIds.push(response.body.id);
      expect(response.body.background).toBe("Wandering Storyteller");
    });

    it("rejects an unresolvable speciesId with 400", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send({ ...createBody(), speciesId: "not-a-real-species-id" });

      expect(response.status).toBe(400);
    });

    it("rejects an unresolvable class with 400", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send({ ...createBody(), classes: [{ name: "Not A Real Class" }] });

      expect(response.status).toBe(400);
    });

    it("rejects an unknown alignment with 400", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send({ ...createBody(), alignment: "Mostly Good" });

      expect(response.status).toBe(400);
    });

    it("rejects a missing required field with 400", async () => {
      const { name, ...withoutName } = createBody();
      void name;

      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send(withoutName);

      expect(response.status).toBe(400);
    });

    it("rejects a derived/mechanical field via .strict() with 400", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send({ ...createBody(), armorClass: 99 });

      expect(response.status).toBe(400);
    });

    describe("background ability spread + Origin feat (#1130)", () => {
      const criminalBody = {
        name: "Sneak",
        alignment: "True Neutral",
        background: "Criminal",
        classes: [{ name: "Fighter" }],
        abilityScores: { strength: 10, dexterity: 13, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 },
      };

      async function post(body: object) {
        const speciesId = await seededSpeciesId("Halfling", "EDITION_2024");
        return supertest.agent(app).set("Cookie", COOKIE).post("/api/characters").send({ speciesId, ...body });
      }

      it("applies the +2/+1 spread, grants the origin feat, and consumes no slot", async () => {
        const res = await post({ ...criminalBody, backgroundAbilities: { dexterity: 2, intelligence: 1 } });
        expect(res.status).toBe(201);
        createdCharacterIds.push(res.body.id);

        expect(res.body.abilityScores.dexterity).toBe(15);
        expect(res.body.abilityScores.intelligence).toBe(13);
        expect(res.body.abilityScores.constitution).toBe(14);

        expect(res.body.advancements).toHaveLength(1);
        expect(res.body.advancements[0]).toMatchObject({ kind: "feat", origin: true, featName: "Alert" });
        expect(res.body.advancementSlots).toEqual({ total: 0, used: 0 });

        expect(res.body.initiativeBonus).toBe(4);
      });

      it("applies a +1/+1/+1 spread across all three abilities", async () => {
        const res = await post({ ...criminalBody, backgroundAbilities: { dexterity: 1, constitution: 1, intelligence: 1 } });
        expect(res.status).toBe(201);
        createdCharacterIds.push(res.body.id);
        expect(res.body.abilityScores.dexterity).toBe(14);
        expect(res.body.abilityScores.constitution).toBe(15);
        expect(res.body.abilityScores.intelligence).toBe(13);
      });

      it("a CON-touching spread raises level-1 max HP", async () => {
        const res = await post({ ...criminalBody, backgroundAbilities: { constitution: 2, dexterity: 1 } });
        expect(res.status).toBe(201);
        createdCharacterIds.push(res.body.id);
        expect(res.body.abilityScores.constitution).toBe(16);
        expect(res.body.hitPoints.max).toBe(13);
      });

      it("grants the origin feat even when the spread is omitted (no bump)", async () => {
        const res = await post(criminalBody);
        expect(res.status).toBe(201);
        createdCharacterIds.push(res.body.id);
        expect(res.body.abilityScores.dexterity).toBe(13);
        expect(res.body.advancements).toHaveLength(1);
        expect(res.body.advancements[0]).toMatchObject({ origin: true, featName: "Alert" });
      });

      it("rejects an ability outside the background's three with 400", async () => {
        const res = await post({ ...criminalBody, backgroundAbilities: { strength: 2, dexterity: 1 } });
        expect(res.status).toBe(400);
      });

      it.each([
        ["a single +3", { dexterity: 3 }],
        ["+2/+2 (sum 4)", { dexterity: 2, constitution: 2 }],
        // Exercises the shape check itself, not the choices-membership short-circuit.
        ["in-choices sum 4 (1/1/2)", { dexterity: 1, constitution: 1, intelligence: 2 }],
      ])("rejects an illegal shape (%s) with 400", async (_label, backgroundAbilities) => {
        const res = await post({ ...criminalBody, backgroundAbilities });
        expect(res.status).toBe(400);
      });

      it("rejects a spread pushing a score over 20 with 400", async () => {
        const res = await post({
          ...criminalBody,
          abilityScores: { ...criminalBody.abilityScores, dexterity: 19 },
          backgroundAbilities: { dexterity: 2, constitution: 1 },
        });
        expect(res.status).toBe(400);
      });

      it("rejects backgroundAbilities on a spec-less/custom background with 400", async () => {
        const res = await post({
          ...criminalBody,
          background: "Wandering Storyteller",
          backgroundAbilities: { dexterity: 2, constitution: 1 },
        });
        expect(res.status).toBe(400);
      });
    });

    describe("2014 characters get no origin feat and no ability spread (#1504, #1572)", () => {
      const criminal2014Body = {
        name: "Sneak (2014)",
        alignment: "True Neutral",
        background: "Criminal",
        classes: [{ name: "Fighter" }],
        rulesEdition: "EDITION_2014" as const,
        abilityScores: { strength: 10, dexterity: 13, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 },
      };

      // Lightfoot Halfling: DEX+2, CHA+1; CON stays untouched, isolating the no-background-spread assertion below.
      async function post(body: object) {
        const halfling = await prisma.species.findFirstOrThrow({
          where: { slug: "halfling", edition: "EDITION_2014" },
          include: { variants: true },
        });
        const lightfoot = halfling.variants.find((v) => v.slug === "lightfoot")!;
        return supertest.agent(app).set("Cookie", COOKIE).post("/api/characters")
          .send({ speciesId: halfling.id, variantId: lightfoot.id, ...body });
      }

      it("grants no origin feat and no BACKGROUND ability spread (species' own fixed increase still applies, #1681)", async () => {
        const res = await post(criminal2014Body);
        expect(res.status).toBe(201);
        createdCharacterIds.push(res.body.id);

        expect(res.body.advancements).toHaveLength(0);
        expect(res.body.abilityScores).toEqual({
          ...criminal2014Body.abilityScores,
          dexterity: 15,
          charisma: 9,
        });
        // CON untouched (14) → 12 max HP, not the 13 a background spread would give.
        expect(res.body.hitPoints.max).toBe(12);
      });

      it("400s a submitted backgroundAbilities spread with the 2014-specific message", async () => {
        const res = await post({ ...criminal2014Body, backgroundAbilities: { dexterity: 2, intelligence: 1 } });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("backgroundAbilities not allowed: background ability scores are a 2024 rule");
      });
    });

    describe("with startingEquipment (package mode)", () => {
      // PHB'14 Wizard package has 4 fixed groups; EDITION_2024's has 1 lettered group (#1535) — bodies here pin rulesEdition rather than relying on the default.
      // A function, not a const — speciesId requires an async DB lookup, unavailable at describe-body evaluation time.
      const wizardBody = async () => ({
        name: "Merlin",
        alignment: "Neutral Good",
        speciesId: await seededSpeciesId("Human", "EDITION_2014"),
        background: "Sage",
        classes: [{ name: "Wizard" }],
        abilityScores: {
          strength: 8,
          dexterity: 12,
          constitution: 12,
          intelligence: 16,
          wisdom: 10,
          charisma: 10,
        },
        skillProficiencies: ["arcana", "history"],
        rulesEdition: "EDITION_2014" as const,
        startingEquipment: {
          mode: "package",
          selections: [
            { optionIndex: 0 },
            { optionIndex: 0 },
            { optionIndex: 0 },
            { optionIndex: 0 },
          ],
        },
      });

      it("creates inventory rows from a package selection (no open picks)", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send(await wizardBody());

        expect(response.status).toBe(201);
        createdCharacterIds.push(response.body.id);

        const names: string[] = response.body.inventory.map(
          (i: { name: string }) => i.name
        );
        expect(names).toContain("Quarterstaff");
        expect(names).toContain("Component Pouch");
        expect(names).toContain("Spellbook");
        expect(names).not.toContain("Scholar's Pack");
        expect(names).toContain("Backpack");
        // Currency stays zero for the package path even though package-mode selections can add gold (#1564).
        expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
      });

      it("creates inventory rows with an open-pick weapon (Fighter martial weapon)", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({
            name: "Sir Gawain",
            alignment: "Lawful Good",
            speciesId: await seededSpeciesId("Human", "EDITION_2014"),
            background: "Soldier",
            classes: [{ name: "Fighter" }],
            abilityScores: {
              strength: 16,
              dexterity: 12,
              constitution: 14,
              intelligence: 8,
              wisdom: 10,
              charisma: 8,
            },
            skillProficiencies: ["athletics", "intimidation"],
            rulesEdition: "EDITION_2014",
            startingEquipment: {
              mode: "package",
              selections: [
                { optionIndex: 0 },                          // Chain Mail
                { optionIndex: 0, openPicks: ["Longsword"] }, // Martial weapon + Shield
                { optionIndex: 1 },                          // Two Handaxes
                { optionIndex: 0 },                          // Dungeoneer's Pack
              ],
            },
          });

        expect(response.status).toBe(201);
        createdCharacterIds.push(response.body.id);

        const names: string[] = response.body.inventory.map(
          (i: { name: string }) => i.name
        );
        expect(names).toContain("Chain Mail");
        expect(names).toContain("Longsword");
        expect(names).toContain("Shield");
        expect(names).toContain("Handaxe");
        expect(names).not.toContain("Dungeoneer's Pack");
        expect(names).toContain("Backpack");
        expect(names).toContain("Torch");
        const longsword = response.body.inventory.find(
          (i: { name: string }) => i.name === "Longsword"
        );
        expect(longsword?.weapon?.weaponClass).toBe("martial");

        expect(longsword?.equipped).toBe(true);
        const chainMail = response.body.inventory.find(
          (i: { name: string }) => i.name === "Chain Mail"
        );
        expect(chainMail?.equipped).toBe(true);
        const shield = response.body.inventory.find(
          (i: { name: string }) => i.name === "Shield"
        );
        expect(shield?.equipped).toBe(true);
        const handaxe = response.body.inventory.find(
          (i: { name: string }) => i.name === "Handaxe"
        );
        expect(handaxe?.equipped).toBe(false);
      });

      it("auto-equips a two-handed weapon alone — no second weapon (issue #51)", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({
            name: "Hrothgar",
            alignment: "Chaotic Good",
            speciesId: await seededSpeciesId("Human", "EDITION_2014"),
            background: "Soldier",
            classes: [{ name: "Fighter" }],
            abilityScores: {
              strength: 16,
              dexterity: 12,
              constitution: 14,
              intelligence: 8,
              wisdom: 10,
              charisma: 8,
            },
            skillProficiencies: ["athletics", "intimidation"],
            rulesEdition: "EDITION_2014",
            startingEquipment: {
              mode: "package",
              selections: [
                { optionIndex: 0 },                                       // Chain Mail
                { optionIndex: 1, openPicks: ["Greataxe", "Longsword"] }, // Two martial weapons
                { optionIndex: 1 },                                       // Two Handaxes
                { optionIndex: 0 },                                       // Dungeoneer's Pack
              ],
            },
          });

        expect(response.status).toBe(201);
        createdCharacterIds.push(response.body.id);

        const greataxe = response.body.inventory.find(
          (i: { name: string }) => i.name === "Greataxe"
        );
        expect(greataxe?.weapon?.twoHanded).toBe(true);
        expect(greataxe?.equipped).toBe(true);

        const chainMail = response.body.inventory.find(
          (i: { name: string }) => i.name === "Chain Mail"
        );
        expect(chainMail?.equipped).toBe(true);
        const longsword = response.body.inventory.find(
          (i: { name: string }) => i.name === "Longsword"
        );
        expect(longsword?.equipped).toBe(false);
      });

      it("rejects optionIndex out of range with 400", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({
            ...(await wizardBody()),
            startingEquipment: {
              mode: "package",
              selections: [
                { optionIndex: 99 },
                { optionIndex: 0 },
                { optionIndex: 0 },
                { optionIndex: 0 },
              ],
            },
          });

        expect(response.status).toBe(400);
      });

      it("rejects wrong number of selections with 400", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({
            ...(await wizardBody()),
            startingEquipment: {
              mode: "package",
              selections: [{ optionIndex: 0 }, { optionIndex: 0 }],
            },
          });

        expect(response.status).toBe(400);
      });

      it("rejects an open pick that is not in the catalog with 400", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({
            name: "Bad Fighter",
            alignment: "Chaotic Evil",
            speciesId: await seededSpeciesId("Human", "EDITION_2014"),
            background: "Soldier",
            classes: [{ name: "Fighter" }],
            abilityScores: {
              strength: 16,
              dexterity: 12,
              constitution: 14,
              intelligence: 8,
              wisdom: 10,
              charisma: 8,
            },
            skillProficiencies: ["athletics", "intimidation"],
            rulesEdition: "EDITION_2014",
            startingEquipment: {
              mode: "package",
              selections: [
                { optionIndex: 0 },
                { optionIndex: 0, openPicks: ["Vorpal Sword of Doom"] },
                { optionIndex: 1 },
                { optionIndex: 0 },
              ],
            },
          });

        expect(response.status).toBe(400);
      });

      it("rejects an open pick with wrong weapon class with 400", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({
            name: "Sneaky Fighter",
            alignment: "Chaotic Neutral",
            speciesId: await seededSpeciesId("Human", "EDITION_2014"),
            background: "Soldier",
            classes: [{ name: "Fighter" }],
            abilityScores: {
              strength: 16,
              dexterity: 12,
              constitution: 14,
              intelligence: 8,
              wisdom: 10,
              charisma: 8,
            },
            skillProficiencies: ["athletics", "intimidation"],
            rulesEdition: "EDITION_2014",
            startingEquipment: {
              mode: "package",
              selections: [
                { optionIndex: 0 },
                { optionIndex: 0, openPicks: ["Club"] },
                { optionIndex: 1 },
                { optionIndex: 0 },
              ],
            },
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/weaponClass/);
      });

      it("rejects mode:package for a class with no package definition with 400", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({
            ...createBody(),
            startingEquipment: { mode: "package", selections: [] },
          });

        expect(response.status).toBe(400);
      });

      // resolveStartingGold only range-checks gold when classDef exists (#1534); 999999 proves this isn't accidentally passing a narrow check.
      it("accepts any gold amount unvalidated for a class with no package definition", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({
            ...createBody(),
            startingEquipment: { mode: "gold", gold: 999999 },
          });

        expect(response.status).toBe(201);
        createdCharacterIds.push(response.body.id);
        expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 999999, pp: 0 });
      });
    });

    describe("with startingEquipment (gold mode)", () => {
      // EDITION_2024's Wizard package has no roll-for-gold rule (gold: null, #1564/#1535); this body pins EDITION_2014 rather than relying on the default.
      const baseBody = async () => ({
        name: "Wealthy Adventurer",
        alignment: "True Neutral",
        speciesId: await seededSpeciesId("Human", "EDITION_2014"),
        background: "Sage",
        classes: [{ name: "Wizard" }],
        abilityScores: {
          strength: 8,
          dexterity: 12,
          constitution: 12,
          intelligence: 16,
          wisdom: 10,
          charisma: 10,
        },
        skillProficiencies: ["arcana", "history"],
        rulesEdition: "EDITION_2014" as const,
      });

      it("sets currency.gp and leaves inventory empty", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({ ...(await baseBody()), startingEquipment: { mode: "gold", gold: 100 } });

        expect(response.status).toBe(201);
        createdCharacterIds.push(response.body.id);

        expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 100, pp: 0 });
        expect(response.body.inventory).toHaveLength(0);
      });

      it("rejects gold below the class minimum with 400", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({ ...(await baseBody()), startingEquipment: { mode: "gold", gold: 0 } });

        expect(response.status).toBe(400);
      });

      it("rejects gold above the class maximum with 400", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({ ...(await baseBody()), startingEquipment: { mode: "gold", gold: 999 } });

        expect(response.status).toBe(400);
      });
    });

    it("omitting startingEquipment creates an empty-inventory character (regression)", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send(createBody());

      expect(response.status).toBe(201);
      createdCharacterIds.push(response.body.id);
      expect(response.body.inventory).toHaveLength(0);
      expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
    });
  });

  describe("character ownership (#99)", () => {
    const createBody = () => ({
      name: "Owned Hero",
      alignment: "Lawful Good",
      speciesId: testSpeciesId,
      background: TEST_BACKGROUND.name,
      classes: [{ name: TEST_CLASS.name }],
      abilityScores: {
        strength: 15,
        dexterity: 12,
        constitution: 14,
        intelligence: 8,
        wisdom: 10,
        charisma: 8,
      },
      skillProficiencies: ["athletics", "perception"],
    });

    it("POST stamps ownerId with the authenticated user (#101)", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send(createBody());

      expect(response.status).toBe(201);
      createdCharacterIds.push(response.body.id);

      expect(response.body.ownerId).toBe(TEST_USER.id);

      // Persisted, not just serialized.
      const row = await prisma.character.findUnique({
        where: { id: response.body.id },
        select: { ownerId: true },
      });
      expect(row?.ownerId).toBe(TEST_USER.id);
    });

    it("GET /api/characters is owner-scoped (any ?owner param is ignored)", async () => {
      const filtered = await supertest.agent(app).set("Cookie", COOKIE).get(
        "/api/characters?owner=some-nonexistent-user-id",
      );

      expect(filtered.status).toBe(200);
      expect(filtered.body.map((c: { id: string }) => c.id)).toEqual([FIXTURE.id]);
    });
  });

  describe("DELETE /api/characters/:id", () => {
    it("returns 204 and removes the character", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE).delete(`/api/characters/${FIXTURE.id}`);

      expect(response.status).toBe(204);
      await expect(
        prisma.character.findUnique({ where: { id: FIXTURE.id } })
      ).resolves.toBeNull();

      // afterEach's deleteMany is a no-op here; this just keeps bookkeeping consistent with the cascade test below.
      createdCharacterIds = createdCharacterIds.filter((id) => id !== FIXTURE.id);
    });

    it("cascades to inventory and selection rows", async () => {
      await supertest.agent(app).set("Cookie", COOKIE).delete(`/api/characters/${FIXTURE.id}`);

      await expect(
        prisma.inventoryItem.findMany({ where: { characterId: FIXTURE.id } })
      ).resolves.toHaveLength(0);
      await expect(
        prisma.characterRace.findUnique({ where: { characterId: FIXTURE.id } })
      ).resolves.toBeNull();
      await expect(
        prisma.characterClassEntry.findMany({ where: { characterId: FIXTURE.id } })
      ).resolves.toHaveLength(0);

      createdCharacterIds = createdCharacterIds.filter((id) => id !== FIXTURE.id);
    });

    it("returns 404 for a non-existent id", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE).delete("/api/characters/does-not-exist");

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: "Character not found" });
    });
  });
});
