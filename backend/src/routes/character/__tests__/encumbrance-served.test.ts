import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { inventoryItemFixtureData, type InventoryItemFixtureInput } from "@/test-support/inventory-snapshot-fixture.js";

const OWNER_ID = "owner-encumbrance-served";
const CHARACTER_ID = "encumbrance-served-character";
let COOKIE: string;

const FIXTURE = {
  id: CHARACTER_ID,
  name: "Encumbrance Fixture",
  alignment: "Lawful Good",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 14, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 40, sp: 30, gp: 20, pp: 10 },
};

async function makeItem(name: string, extra: Partial<InventoryItemFixtureInput> = {}) {
  return prisma.inventoryItem.create({
    data: inventoryItemFixtureData({ characterId: CHARACTER_ID, name, category: "gear", ...extra }),
  });
}

function get() {
  return supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${CHARACTER_ID}`);
}

describe("GET /api/characters/:id — encumbrance + attunement cap (#1377)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({
      data: {
        ...FIXTURE,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "Fighter", level: 1, position: 0 } },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CHARACTER_ID } });
  });

  it("serves capacity from STR × 15 and carried weight from the pack plus the purse", async () => {
    await makeItem("Iron Ingot", { weight: 10, quantity: 3 });

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.body.carryCapacity).toBe(210);
    expect(response.body.carriedWeight).toBe(32);
  });

  it("capacity tracks the served (clamped) STR score, not the raw column", async () => {
    // Guards against the serializer reading the raw column instead of the clamped/served ability score.
    await prisma.character.update({
      where: { id: CHARACTER_ID },
      data: {
        resources: {
          advancements: [
            {
              id: "adv-clamped-asi",
              level: 4,
              kind: "asi",
              abilityDeltas: { strength: 2 },
              hpDelta: 0,
              initDelta: 0,
            },
          ],
        },
      },
    });

    const response = await get();

    expect(response.body.abilityScores.strength).toBe(12);
    expect(response.body.carryCapacity).toBe(180);
  });

  it("recomputes carried weight when an item's quantity changes", async () => {
    const item = await makeItem("Iron Ingot", { weight: 10, quantity: 3 });

    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post(`/api/characters/${CHARACTER_ID}/inventory/transactions`)
      .send({ operations: [{ type: "adjustQuantity", inventoryItemId: item.id, delta: 2 }] });

    expect(response.status).toBe(200);

    expect(response.body.carriedWeight).toBe(52);
  });

  it("recomputes carried weight when currency changes", async () => {
    await makeItem("Iron Ingot", { weight: 10, quantity: 3 });

    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .patch(`/api/characters/${CHARACTER_ID}`)
      .send({ currency: { cp: 0, sp: 0, gp: 500, pp: 0 } });

    expect(response.status).toBe(200);

    expect(response.body.carriedWeight).toBe(40);
  });

  it("serves the attunement cap the attune path rejects on: 3 attune, the 4th 409s", async () => {
    const items = await Promise.all(
      ["A", "B", "C", "D"].map((n) => makeItem(`Trinket ${n}`, { requiresAttunement: true })),
    );

    for (const item of items.slice(0, 3)) {
      const ok = await supertest
        .agent(app)
        .set("Cookie", COOKIE)
        .post(`/api/characters/${CHARACTER_ID}/inventory/transactions`)
        .send({ operations: [{ type: "attune", inventoryItemId: item.id }] });
      expect(ok.status).toBe(200);
      expect(ok.body.attunementCap).toBe(3);
    }

    const rejected = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post(`/api/characters/${CHARACTER_ID}/inventory/transactions`)
      .send({ operations: [{ type: "attune", inventoryItemId: items[3].id }] });

    expect(rejected.status).toBe(409);
    const after = await get();
    expect(after.body.inventory.filter((i: { attuned: boolean }) => i.attuned)).toHaveLength(3);
  });
});
