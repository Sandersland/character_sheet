// resolveFixedItems collapses items into a Map keyed by name — a CAMPAIGN-scoped Item sharing a GLOBAL item's name silently overwrites it (wrong item granted); GET /api/items would also leak it to every client (#1645, #1650).
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { seededSpeciesId } from "@/test-support/species.js";

const OWNER_ID = "owner-item-scope-shadowing";
const SHADOWED_NAME = "Dagger";

const FIXTURE_CLASS = {
  name: "Zzz Fixture Shadowing Class (#1645)",
  hitDie: "d8",
  savingThrows: ["dexterity"],
  skillChoiceCount: 0,
  skillChoices: [] as string[],
  isSpellcaster: false,
};

let COOKIE: string;
let fixtureClassId: string;
let campaignId: string;
let globalDaggerId: string;
let campaignDaggerId: string;
let human2014Id: string;
const createdCharacterIds: string[] = [];

function baseBody() {
  return {
    name: "Fixture Shadowing Character",
    alignment: "True Neutral",
    speciesId: human2014Id,
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
    rulesEdition: "EDITION_2014" as const,
  };
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  human2014Id = await seededSpeciesId("Human", "EDITION_2014");

  const cls = await prisma.characterClass.upsert({
    where: { name: FIXTURE_CLASS.name },
    create: FIXTURE_CLASS,
    update: FIXTURE_CLASS,
  });
  fixtureClassId = cls.id;

  await prisma.startingEquipmentPackage.create({
    data: {
      classId: fixtureClassId,
      name: FIXTURE_CLASS.name,
      edition: "EDITION_2014",
      goldDiceCount: 1,
      goldDiceFaces: 4,
      goldMultiplier: 10,
      groups: {
        create: [
          {
            position: 0,
            label: "shadowing fixture gear",
            options: {
              create: [
                {
                  position: 0,
                  label: "shadowing fixture gear",
                  items: { create: [{ position: 0, catalogName: SHADOWED_NAME }] },
                },
              ],
            },
          },
        ],
      },
    },
  });

  const campaign = await prisma.campaign.create({
    data: {
      name: "Item Scope Shadowing Campaign",
      ownerId: OWNER_ID,
      inviteCode: randomUUID(),
      members: { create: { userId: OWNER_ID, role: "OWNER" } },
    },
  });
  campaignId = campaign.id;

  globalDaggerId = (
    await prisma.item.findUniqueOrThrow({
      where: { scopeKey_name: { scopeKey: "global", name: SHADOWED_NAME } },
      select: { id: true },
    })
  ).id;

  // Created after the catalog row so an unscoped findMany returns it last — that's what wins the Map insertion race in resolveFixedItems.
  campaignDaggerId = (
    await prisma.item.create({
      data: {
        name: SHADOWED_NAME,
        category: "gear",
        scope: "CAMPAIGN",
        scopeKey: `campaign:${campaignId}`,
        campaignId,
        description: "DM homebrew that must never reach the catalog surface.",
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: createdCharacterIds } } });
  // Cascades to the package's groups/options/items.
  await prisma.characterClass.deleteMany({ where: { name: FIXTURE_CLASS.name } });
  // Cascades to the campaign-scoped Item row.
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
});

describe("a CAMPAIGN-scoped Item never shadows the catalog (#1645)", () => {
  it("starting equipment resolves the GLOBAL row, not the campaign impostor", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send({ ...baseBody(), startingEquipment: { mode: "package", selections: [{ optionIndex: 0 }] } });

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);

    const granted = response.body.inventory.find((i: { name: string }) => i.name === SHADOWED_NAME);
    expect(granted).toBeDefined();
    expect(granted.itemId).toBe(globalDaggerId);
    expect(granted.itemId).not.toBe(campaignDaggerId);
  });

  it("GET /api/items returns only GLOBAL rows", async () => {
    const response = await supertest.agent(app).set("Cookie", COOKIE).get("/api/items");

    expect(response.status).toBe(200);
    const ids: string[] = response.body.map((i: { id: string }) => i.id);
    expect(ids).toContain(globalDaggerId);
    expect(ids).not.toContain(campaignDaggerId);

    const daggers = response.body.filter((i: { name: string }) => i.name === SHADOWED_NAME);
    expect(daggers).toHaveLength(1);
  });
});
