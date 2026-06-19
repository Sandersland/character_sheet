import { afterAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";

const TEST_ITEM = {
  name: "Test Catalog Dagger",
  category: "weapon" as const,
  weight: 1,
  cost: { cp: 0, sp: 0, gp: 2, pp: 0 },
  damageDice: "1d4",
  damageType: "piercing",
  properties: ["finesse", "light", "thrown"],
};

describe("GET /api/items", () => {
  afterAll(async () => {
    await prisma.item.deleteMany({ where: { name: TEST_ITEM.name } });
  });

  it("returns the equipment catalog used to drive the inventory editor", async () => {
    await prisma.item.upsert({
      where: { name: TEST_ITEM.name },
      create: TEST_ITEM,
      update: TEST_ITEM,
    });

    const response = await supertest(createApp()).get("/api/items");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    const item = response.body.find((row: { name: string }) => row.name === TEST_ITEM.name);
    expect(item).toMatchObject({
      category: "weapon",
      damageDice: "1d4",
      damageType: "piercing",
      properties: ["finesse", "light", "thrown"],
    });
  });
});
