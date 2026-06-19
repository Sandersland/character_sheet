import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

const TEST_ITEM = {
  name: "Route Test Dagger",
  category: "weapon" as const,
  weight: 1,
  cost: { cp: 0, sp: 0, gp: 2, pp: 0 },
};
const TEST_WEAPON_DETAIL = {
  damageDiceCount: 1,
  damageDiceFaces: 4,
  damageType: "piercing",
  finesse: true,
  light: true,
};

const FIXTURE = {
  id: "test-inventory-character-1",
  name: "Inventory Test Fixture",
  alignment: "Lawful Good",
  experiencePoints: 0,
  armorClass: 10,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  currency: { cp: 0, sp: 0, gp: 5, pp: 0 },
  journal: [],
};

describe("POST /api/characters/:id/inventory/transactions", () => {
  let itemId: string;

  afterAll(async () => {
    await prisma.item.deleteMany({ where: { name: TEST_ITEM.name } });
  });

  beforeEach(async () => {
    const item = await prisma.item.upsert({
      where: { name: TEST_ITEM.name },
      create: { ...TEST_ITEM, weaponDetail: { create: TEST_WEAPON_DETAIL } },
      update: {
        ...TEST_ITEM,
        weaponDetail: { upsert: { create: TEST_WEAPON_DETAIL, update: TEST_WEAPON_DETAIL } },
      },
    });
    itemId = item.id;

    await prisma.character.create({ data: { ...FIXTURE, spellcasting: Prisma.JsonNull } });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE.id } });
  });

  it("404s for an unknown character", async () => {
    const response = await supertest(createApp())
      .post("/api/characters/does-not-exist/inventory/transactions")
      .send({ operations: [{ type: "acquire", itemId: "whatever" }] });

    expect(response.status).toBe(404);
  });

  it("400s on a malformed body", async () => {
    const response = await supertest(createApp())
      .post(`/api/characters/${FIXTURE.id}/inventory/transactions`)
      .send({ operations: [{ type: "notARealType" }] });

    expect(response.status).toBe(400);
  });

  it("acquire from the catalog returns the full character with the new nested-detail row", async () => {
    const response = await supertest(createApp())
      .post(`/api/characters/${FIXTURE.id}/inventory/transactions`)
      .send({ operations: [{ type: "acquire", itemId, quantity: 2, equipped: true }] });

    expect(response.status).toBe(200);
    expect(response.body.inventory).toHaveLength(1);
    expect(response.body.inventory[0]).toMatchObject({
      name: TEST_ITEM.name,
      category: "weapon",
      quantity: 2,
      equipped: true,
      weapon: { damageDiceCount: 1, damageDiceFaces: 4, damageType: "piercing", finesse: true },
    });
  });

  it("a custom homebrew acquire requires the category's minimal detail fields", async () => {
    const missingDetail = await supertest(createApp())
      .post(`/api/characters/${FIXTURE.id}/inventory/transactions`)
      .send({ operations: [{ type: "acquire", custom: { name: "Mystery Blade", category: "weapon" } }] });
    expect(missingDetail.status).toBe(400);

    const withDetail = await supertest(createApp())
      .post(`/api/characters/${FIXTURE.id}/inventory/transactions`)
      .send({
        operations: [
          {
            type: "acquire",
            custom: {
              name: "Mystery Blade",
              category: "weapon",
              weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing" },
            },
          },
        ],
      });
    expect(withDetail.status).toBe(200);
    expect(withDetail.body.inventory).toHaveLength(1);
    expect(withDetail.body.inventory[0].itemId).toBeUndefined();
  });

  it("buying debits currency in the same response", async () => {
    const response = await supertest(createApp())
      .post(`/api/characters/${FIXTURE.id}/inventory/transactions`)
      .send({ operations: [{ type: "acquire", itemId, currencyDelta: { cp: 0, sp: 0, gp: 2, pp: 0 } }] });

    expect(response.status).toBe(200);
    expect(response.body.currency).toEqual({ cp: 0, sp: 0, gp: 3, pp: 0 });
  });

  it("rejects a buy that exceeds current currency and changes nothing", async () => {
    const response = await supertest(createApp())
      .post(`/api/characters/${FIXTURE.id}/inventory/transactions`)
      .send({ operations: [{ type: "acquire", itemId, currencyDelta: { cp: 0, sp: 0, gp: 999, pp: 0 } }] });

    expect(response.status).toBe(400);

    const character = await supertest(createApp()).get(`/api/characters/${FIXTURE.id}`);
    expect(character.body.currency).toEqual({ cp: 0, sp: 0, gp: 5, pp: 0 });
    expect(character.body.inventory).toHaveLength(0);
  });

  it("a multi-op batch applies atomically: a later failing op rolls back an earlier valid one", async () => {
    const response = await supertest(createApp())
      .post(`/api/characters/${FIXTURE.id}/inventory/transactions`)
      .send({
        operations: [
          { type: "acquire", itemId, quantity: 1 },
          { type: "adjustQuantity", inventoryItemId: "not-a-real-id", delta: -1 },
        ],
      });

    expect(response.status).toBe(400);

    const character = await supertest(createApp()).get(`/api/characters/${FIXTURE.id}`);
    expect(character.body.inventory).toHaveLength(0);
  });

  it("update renames an item and overrides a weapon field, then sell removes it and credits currency", async () => {
    const acquireResponse = await supertest(createApp())
      .post(`/api/characters/${FIXTURE.id}/inventory/transactions`)
      .send({ operations: [{ type: "acquire", itemId, quantity: 1 }] });
    const inventoryItemId = acquireResponse.body.inventory[0].id;

    const updateResponse = await supertest(createApp())
      .post(`/api/characters/${FIXTURE.id}/inventory/transactions`)
      .send({
        operations: [{ type: "update", inventoryItemId, name: "Dagger +1", weapon: { damageModifier: 1 } }],
      });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.inventory[0]).toMatchObject({
      name: "Dagger +1",
      weapon: { damageModifier: 1, damageDiceFaces: 4 },
    });

    const sellResponse = await supertest(createApp())
      .post(`/api/characters/${FIXTURE.id}/inventory/transactions`)
      .send({
        operations: [
          { type: "sell", inventoryItemId, currencyDelta: { cp: 0, sp: 0, gp: 1, pp: 0 } },
        ],
      });
    expect(sellResponse.status).toBe(200);
    expect(sellResponse.body.inventory).toHaveLength(0);
    expect(sellResponse.body.currency).toEqual({ cp: 0, sp: 0, gp: 6, pp: 0 });
  });
});
