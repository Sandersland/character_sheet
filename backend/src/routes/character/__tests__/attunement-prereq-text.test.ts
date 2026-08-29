import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { inventoryItemFixtureData, type InventoryItemFixtureInput } from "@/test-support/inventory-snapshot-fixture.js";

const OWNER_ID = "owner-attunement-prereq-text";
const CHARACTER_ID = "attunement-prereq-text-character";
let COOKIE: string;

const FIXTURE = {
  id: CHARACTER_ID,
  name: "Attunement Text Fixture",
  alignment: "Lawful Good",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function makeItem(name: string, extra: Partial<InventoryItemFixtureInput> = {}) {
  return prisma.inventoryItem.create({
    data: inventoryItemFixtureData({ characterId: CHARACTER_ID, name, category: "gear", ...extra }),
  });
}

function inventoryRow(body: { inventory: { name: string }[] }, name: string) {
  const row = body.inventory.find((i) => i.name === name);
  if (!row) throw new Error(`no inventory row named ${name}`);
  return row as Record<string, unknown>;
}

describe("GET /api/characters/:id — attunementPrereqText (#1382)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({
      data: {
        ...FIXTURE,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: { name: "Wizard", level: 5, position: 0 } },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CHARACTER_ID } });
  });

  it("resolves the phrasing per kind and keeps the raw kind/value on the wire", async () => {
    await makeItem("Wizard's Bracers", {
      requiresAttunement: true,
      attunementPrereqKind: "class",
      attunementPrereqValue: "Wizard",
    });
    await makeItem("Staff of Testing", { requiresAttunement: true, attunementPrereqKind: "spellcaster" });

    const body = (await supertest(app).get(`/api/characters/${CHARACTER_ID}`).set("Cookie", COOKIE)).body;

    expect(inventoryRow(body, "Wizard's Bracers")).toMatchObject({
      attunementPrereqKind: "class",
      attunementPrereqValue: "Wizard",
      attunementPrereqText: "a Wizard",
    });
    expect(inventoryRow(body, "Staff of Testing")).toMatchObject({
      attunementPrereqKind: "spellcaster",
      attunementPrereqText: "a spellcaster",
    });
  });

  it("omits the key entirely for a row with no prerequisite kind", async () => {
    await makeItem("Plain Cloak", { requiresAttunement: true });

    const body = (await supertest(app).get(`/api/characters/${CHARACTER_ID}`).set("Cookie", COOKIE)).body;

    expect(inventoryRow(body, "Plain Cloak")).not.toHaveProperty("attunementPrereqText");
  });

  it("serves byte-identical text to the 400 an unmet prerequisite rejects with", async () => {
    const item = await makeItem("Holy Avenger", {
      requiresAttunement: true,
      attunementPrereqKind: "class",
      attunementPrereqValue: "Paladin",
    });

    const body = (await supertest(app).get(`/api/characters/${CHARACTER_ID}`).set("Cookie", COOKIE)).body;
    const servedText = inventoryRow(body, "Holy Avenger").attunementPrereqText;

    // 400 (InvalidInventoryOperationError), not the 409 AttunementLimitError path.
    const attune = await supertest(app)
      .post(`/api/characters/${CHARACTER_ID}/inventory/transactions`)
      .set("Cookie", COOKIE)
      .send({ operations: [{ type: "attune", inventoryItemId: item.id }] });

    expect(attune.status).toBe(400);
    expect(attune.body.error).toBe(`Holy Avenger requires attunement by ${servedText}`);
  });

  it("serves the same vowel-agreed text to both tiers (#1485)", async () => {
    // No raceSelection on the fixture, so the species prereq is unmet, hitting the 400 prerequisite path, not the 409 cap.

    const item = await makeItem("Elven Chain", {
      requiresAttunement: true,
      attunementPrereqKind: "species",
      attunementPrereqValue: "Elf",
    });

    const body = (await supertest(app).get(`/api/characters/${CHARACTER_ID}`).set("Cookie", COOKIE)).body;
    const servedText = inventoryRow(body, "Elven Chain").attunementPrereqText;
    expect(servedText).toBe("an Elf");

    const attune = await supertest(app)
      .post(`/api/characters/${CHARACTER_ID}/inventory/transactions`)
      .set("Cookie", COOKIE)
      .send({ operations: [{ type: "attune", inventoryItemId: item.id }] });

    expect(attune.status).toBe(400);
    expect(attune.body.error).toBe(`Elven Chain requires attunement by ${servedText}`);
  });
});
