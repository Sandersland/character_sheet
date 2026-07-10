import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/prisma.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-items";
let COOKIE: string;

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

const TEST_ITEM = {
  name: "Test Catalog Dagger",
  category: "weapon" as const,
  weight: 1,
  cost: { cp: 0, sp: 0, gp: 2, pp: 0 },
};
const TEST_ITEM_WEAPON_DETAIL = {
  damageDiceCount: 1,
  damageDiceFaces: 4,
  damageType: "piercing",
  finesse: true,
  light: true,
  thrown: true,
};

describe("GET /api/items", () => {
  afterAll(async () => {
    await prisma.item.deleteMany({ where: { name: TEST_ITEM.name } });
  });

  it("returns the equipment catalog used to drive the inventory editor", async () => {
    await prisma.item.upsert({
      where: { name: TEST_ITEM.name },
      create: { ...TEST_ITEM, weaponDetail: { create: TEST_ITEM_WEAPON_DETAIL } },
      update: {
        ...TEST_ITEM,
        weaponDetail: { upsert: { create: TEST_ITEM_WEAPON_DETAIL, update: TEST_ITEM_WEAPON_DETAIL } },
      },
    });

    const response = await supertest.agent(createApp()).set("Cookie", COOKIE).get("/api/items");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    const item = response.body.find((row: { name: string }) => row.name === TEST_ITEM.name);
    expect(item).toMatchObject({
      category: "weapon",
      weapon: {
        damageDiceCount: 1,
        damageDiceFaces: 4,
        damageType: "piercing",
        finesse: true,
        light: true,
        thrown: true,
      },
    });
    expect(item.armor).toBeUndefined();
    expect(item.consumable).toBeUndefined();
  });
});
