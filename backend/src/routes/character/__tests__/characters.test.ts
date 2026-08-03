import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

const TEST_USER = { id: "test-user-1", email: "fixture-owner@test.local" };
let COOKIE: string;
const TEST_RACE = { name: "Test Race", speed: 30 };
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
  // Track every character created over the course of a test (the fixture
  // plus anything a POST test creates) so afterEach can clean all of them
  // up, even ids we don't know ahead of time.
  let createdCharacterIds: string[] = [];

  beforeEach(async () => {
    // Every character needs an owner (Character.ownerId is NOT NULL). Upsert a
    // dedicated fixture user so the create below can connect to it.
    await prisma.user.upsert({
      where: { id: TEST_USER.id },
      create: TEST_USER,
      update: TEST_USER,
    });
    COOKIE = await authCookie(TEST_USER.id);
    // Sequential rather than Promise.all — see the matching comment in
    // charactersRouter's POST handler.
    const race = await prisma.race.upsert({
      where: { name: TEST_RACE.name },
      create: TEST_RACE,
      update: TEST_RACE,
    });
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
        raceSelection: { create: { name: race.name, raceId: race.id } },
        backgroundSelection: { create: { name: background.name, backgroundId: background.id } },
        classEntries: {
          create: [{ name: characterClass.name, classId: characterClass.id, position: 0 }],
        },
        inventoryItems: {
          create: [
            {
              itemId: item.id,
              name: item.name,
              category: item.category,
              weight: item.weight,
              cost: TEST_ITEM.cost,
              quantity: 1,
              equippedSlot: "MAIN_HAND",
              position: 0,
              weaponDetail: { create: TEST_ITEM_WEAPON_DETAIL },
            },
            {
              itemId: null,
              name: "Homebrew Amulet",
              category: "gear",
              description: "A custom magic item with no catalog entry.",
              quantity: 1,
              position: 1,
            },
          ],
        },
      },
    });

    createdCharacterIds = [FIXTURE.id];
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: { in: createdCharacterIds } } });
  });

  // The catalog rows are upserted (not deleted) between tests so reruns don't
  // churn ids — but a later file on this worker inherits the same database, so
  // they must not linger as selectable catalog options once the suite is done.
  afterAll(async () => {
    await prisma.race.deleteMany({ where: { name: TEST_RACE.name } });
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
    // Deliberately unscoped — the whole Character table, which only a
    // per-worker database makes assertable (#1269). It doubles as a leak
    // detector for any earlier file sharing this worker.
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
    // Creates a bare character with the given class entries and optional equipped
    // body-armor category, then returns its serialized speed. classId is left null
    // (nullable FK) so no catalog rows are needed — the derivation keys off name.
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
          inventoryItems: equippedArmorCategory
            ? {
                create: [
                  {
                    name: `${equippedArmorCategory} armor`,
                    category: "armor",
                    quantity: 1,
                    equippedSlot: equippedArmorCategory === "shield" ? "OFF_HAND" : "BODY",
                    position: 0,
                    armorDetail: {
                      create: {
                        armorCategory: equippedArmorCategory,
                        baseArmorClass: equippedArmorCategory === "shield" ? 2 : 14,
                      },
                    },
                  },
                ],
              }
            : undefined,
        },
      });
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
    // experiencePoints was removed from PATCH — use the dedicated XP endpoint
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

  // The portrait wire seam (#1615): portraitUrl left PATCH when portraits
  // became uploaded blobs — a client-supplied URL was the IDOR the upload
  // pipeline closes. The wire field survives read-only, derived from
  // Character.portraitKey.
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
    // experiencePoints was removed from PATCH — use currency which is still patchable
    const response = await supertest.agent(app).set("Cookie", COOKIE)
      .patch("/api/characters/does-not-exist")
      .send({ currency: { cp: 0, sp: 0, gp: 1, pp: 0 } });

    expect(response.status).toBe(404);
  });

  describe("POST /api/characters", () => {
    const createBody = {
      name: "New Hero",
      alignment: "Lawful Good",
      race: TEST_RACE.name,
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
    };

    it("creates a character and derives mechanical fields from the catalog", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send(createBody);

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
        // constitution 14 -> +2 modifier, d10 hit die -> 12 max HP
        hitPoints: { current: 12, max: 12, temp: 0 },
        // dexterity 12 -> +1 modifier
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
        .send(createBody);

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

    // #1616 closed #1615's interim accepted-and-ignored state: the create UI
    // stages a file and uploads via portraitRouter after create, so a client-
    // supplied URL is rejected by .strict() like every other unknown field.
    it("rejects portraitUrl in the create payload with 400 (#1616)", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send({ ...createBody, portraitUrl: "https://example.com/p.jpg" });

      expect(response.status).toBe(400);
    });

    it("allows a homebrew background with no catalog match", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send({ ...createBody, background: "Wandering Storyteller" });

      expect(response.status).toBe(201);
      createdCharacterIds.push(response.body.id);
      expect(response.body.background).toBe("Wandering Storyteller");
    });

    it("rejects an unresolvable race with 400", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send({ ...createBody, race: "Not A Real Race" });

      expect(response.status).toBe(400);
    });

    it("rejects an unresolvable class with 400", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send({ ...createBody, classes: [{ name: "Not A Real Class" }] });

      expect(response.status).toBe(400);
    });

    it("rejects an unknown alignment with 400", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send({ ...createBody, alignment: "Mostly Good" });

      expect(response.status).toBe(400);
    });

    it("rejects a missing required field with 400", async () => {
      const { name, ...withoutName } = createBody;
      void name;

      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send(withoutName);

      expect(response.status).toBe(400);
    });

    it("rejects a derived/mechanical field via .strict() with 400", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send({ ...createBody, armorClass: 99 });

      expect(response.status).toBe(400);
    });

    // ── 2024 background ability spread + Origin feat (#1130) ──────────────
    // Uses the seeded Criminal background (abilityChoices dex/con/int, Origin
    // feat Alert) with the seeded Human race + Fighter class.
    describe("background ability spread + Origin feat (#1130)", () => {
      const criminalBody = {
        name: "Sneak",
        alignment: "True Neutral",
        race: "Human",
        background: "Criminal",
        classes: [{ name: "Fighter" }],
        abilityScores: { strength: 10, dexterity: 13, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 },
      };

      async function post(body: object) {
        return supertest.agent(app).set("Cookie", COOKIE).post("/api/characters").send(body);
      }

      it("applies the +2/+1 spread, grants the origin feat, and consumes no slot", async () => {
        const res = await post({ ...criminalBody, backgroundAbilities: { dexterity: 2, intelligence: 1 } });
        expect(res.status).toBe(201);
        createdCharacterIds.push(res.body.id);

        // Spread folded into effective scores.
        expect(res.body.abilityScores.dexterity).toBe(15);
        expect(res.body.abilityScores.intelligence).toBe(13);
        expect(res.body.abilityScores.constitution).toBe(14);

        // Origin feat = a slot-exempt advancement entry; slots stay 0/0 at level 1.
        expect(res.body.advancements).toHaveLength(1);
        expect(res.body.advancements[0]).toMatchObject({ kind: "feat", origin: true, featName: "Alert" });
        expect(res.body.advancementSlots).toEqual({ total: 0, used: 0 });

        // DEX 15 → +2 base init, plus Alert's +PB (2 at level 1) = 4.
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
        // CON 14→16 (+3 mod), Fighter d10 → 13 max HP.
        expect(res.body.abilityScores.constitution).toBe(16);
        expect(res.body.hitPoints.max).toBe(13);
      });

      it("grants the origin feat even when the spread is omitted (no bump)", async () => {
        const res = await post(criminalBody);
        expect(res.status).toBe(201);
        createdCharacterIds.push(res.body.id);
        expect(res.body.abilityScores.dexterity).toBe(13); // unchanged
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
        // All three are in Criminal's choices but sum to 4 → exercises the shape
        // check itself (not the choices-membership short-circuit).
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

    // ── Starting equipment tests ──────────────────────────────────────────
    // These tests rely on the seeded catalog (Wizard/Fighter classes, Human
    // race, Sage/Soldier backgrounds, and the weapon/armor/gear items) which
    // is applied via `prisma db seed` before running the test suite.
    describe("with startingEquipment (package mode)", () => {
      // Simplest package path: Wizard with no open picks. This whole describe
      // block exercises the PHB'14 FOUR-group package shape (Group 0:
      // Quarterstaff, Group 1: Component Pouch, Group 2: Scholar's Pack
      // (expands via PACK_CONTENTS -> 6 rows), Group 3: Spellbook auto-grant)
      // by fixed group/optionIndex — the EDITION_2024 Wizard package (#1535)
      // is ONE group of two lettered options instead, so every body here
      // pins rulesEdition explicitly rather than relying on
      // DEFAULT_RULES_EDITION (2024).
      const wizardBody = {
        name: "Merlin",
        alignment: "Neutral Good",
        race: "Human",
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
      };

      it("creates inventory rows from a package selection (no open picks)", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send(wizardBody);

        expect(response.status).toBe(201);
        createdCharacterIds.push(response.body.id);

        // Scholar's Pack expands to 6 items, plus Quarterstaff, Component
        // Pouch, Spellbook = 9 total inventory rows.
        const names: string[] = response.body.inventory.map(
          (i: { name: string }) => i.name
        );
        expect(names).toContain("Quarterstaff");
        expect(names).toContain("Component Pouch");
        expect(names).toContain("Spellbook");
        // Scholar's Pack is expanded — its individual items appear, not the pack itself
        expect(names).not.toContain("Scholar's Pack");
        expect(names).toContain("Backpack");
        // Starting gold should be zero for the package path — also the #1564
        // regression check: every EDITION_2014 option carries gold: 0, so
        // this real package's currency must stay exactly what it is today
        // now that package-mode selections can add gold (starting-equipment-
        // gold.test.ts covers the nonzero accumulation with a fixture package).
        expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
      });

      it("creates inventory rows with an open-pick weapon (Fighter martial weapon)", async () => {
        // Fighter group 1, option 0: martial weapon + shield. Open pick: Longsword
        // (the PHB'14 four-group shape — pin the edition, see wizardBody's comment above)
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({
            name: "Sir Gawain",
            alignment: "Lawful Good",
            race: "Human",
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
        // Handaxe ×2 comes as quantity:2 on one row, or one row with qty 2
        expect(names).toContain("Handaxe");
        // Dungeoneer's Pack expanded
        expect(names).not.toContain("Dungeoneer's Pack");
        expect(names).toContain("Backpack");
        expect(names).toContain("Torch");
        // The Longsword row should have weaponClass:"martial" snapshotted
        const longsword = response.body.inventory.find(
          (i: { name: string }) => i.name === "Longsword"
        );
        expect(longsword?.weapon?.weaponClass).toBe("martial");

        // issue #51: a freshly created martial character must have its primary
        // weapon + body armor + shield auto-equipped (one-handed weapon, so the
        // shield is allowed), but NOT a second weapon (the thrown Handaxes).
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
        // Fighter group 1, option 1: two martial weapons. The first pick is a
        // Greataxe (two-handed); the rules preclude equipping the second weapon.
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({
            name: "Hrothgar",
            alignment: "Chaotic Good",
            race: "Human",
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
        // Confirm the fixture actually gave us a two-handed weapon.
        expect(greataxe?.weapon?.twoHanded).toBe(true);
        expect(greataxe?.equipped).toBe(true);

        // Two-handed weapon consumes the off-hand: the second weapon stays
        // unequipped. Body armor — which never contends for the off-hand — still
        // equips.
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
            ...wizardBody,
            startingEquipment: {
              mode: "package",
              // Wizard has groups.length === 4; optionIndex 99 is out of range
              selections: [
                { optionIndex: 99 }, // invalid
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
            ...wizardBody,
            startingEquipment: {
              mode: "package",
              // Wizard has 4 groups; only 2 provided
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
            race: "Human",
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
                { optionIndex: 0, openPicks: ["Vorpal Sword of Doom"] }, // not in catalog
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
            race: "Human",
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
                // Club is a simple weapon; Fighter group 1 requires "martial"
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
        // TEST_CLASS ("Test Class") has no seeded StartingEquipmentPackage row (#1534)
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({
            ...createBody,
            startingEquipment: { mode: "package", selections: [] },
          });

        expect(response.status).toBe(400);
      });

      // gold mode's range check is wrapped in `if (classDef)` (resolveStartingGold,
      // #1534) — a class with no package row accepts ANY gold amount unvalidated.
      // An absurd amount (999999) that would fail every real class's dice range
      // proves this isn't accidentally passing a narrow check.
      it("accepts any gold amount unvalidated for a class with no package definition", async () => {
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({
            ...createBody,
            startingEquipment: { mode: "gold", gold: 999999 },
          });

        expect(response.status).toBe(201);
        createdCharacterIds.push(response.body.id);
        expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 999999, pp: 0 });
      });
    });

    describe("with startingEquipment (gold mode)", () => {
      // 2014-only: EDITION_2024's Wizard package has no roll-for-gold rule at
      // all (gold: null, #1564/#1535) — pin the edition rather than relying
      // on DEFAULT_RULES_EDITION (2024).
      const baseBody = {
        name: "Wealthy Adventurer",
        alignment: "True Neutral",
        race: "Human",
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
      };

      it("sets currency.gp and leaves inventory empty", async () => {
        // Wizard gold: 4d4×10 → min 40, max 160
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({ ...baseBody, startingEquipment: { mode: "gold", gold: 100 } });

        expect(response.status).toBe(201);
        createdCharacterIds.push(response.body.id);

        expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 100, pp: 0 });
        expect(response.body.inventory).toHaveLength(0);
      });

      it("rejects gold below the class minimum with 400", async () => {
        // Wizard min = 4×10 = 40
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({ ...baseBody, startingEquipment: { mode: "gold", gold: 0 } });

        expect(response.status).toBe(400);
      });

      it("rejects gold above the class maximum with 400", async () => {
        // Wizard max = 4×4×10 = 160
        const response = await supertest.agent(app).set("Cookie", COOKIE)
          .post("/api/characters")
          .send({ ...baseBody, startingEquipment: { mode: "gold", gold: 999 } });

        expect(response.status).toBe(400);
      });
    });

    it("omitting startingEquipment creates an empty-inventory character (regression)", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send(createBody); // createBody has no startingEquipment

      expect(response.status).toBe(201);
      createdCharacterIds.push(response.body.id);
      expect(response.body.inventory).toHaveLength(0);
      expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
    });
  });

  describe("character ownership (#99)", () => {
    const createBody = {
      name: "Owned Hero",
      alignment: "Lawful Good",
      race: TEST_RACE.name,
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
    };

    it("POST stamps ownerId with the authenticated user (#101)", async () => {
      const response = await supertest.agent(app).set("Cookie", COOKIE)
        .post("/api/characters")
        .send(createBody);

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
      // The list is always scoped to the authenticated user; a leftover ?owner
      // query param has no effect. Our fixture (owned by the caller) appears.
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

      // The afterEach deleteMany is harmless on an already-gone id, but clean
      // up bookkeeping the same way the cascade test does.
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
