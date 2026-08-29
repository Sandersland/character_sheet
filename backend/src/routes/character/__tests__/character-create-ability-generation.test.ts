import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-create-ability-gen";
let COOKIE: string;

const STRAIGHT_TWENTIES = {
  strength: 20, dexterity: 20, constitution: 20, intelligence: 20, wisdom: 20, charisma: 20,
};

async function create(body: Record<string, unknown>) {
  const anchor = await seededSpeciesAnchor("EDITION_2024");
  return supertest(app).post("/api/characters").set("Cookie", COOKIE).send({
    alignment: "True Neutral",
    background: "Acolyte",
    classes: [{ name: "Fighter" }],
    ...anchor,
    ...body,
  });
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "CreateAbilityGen" } } });
});
afterAll(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "CreateAbilityGen" } } });
});

describe("POST /api/characters — ability score generation validation", () => {
  it("accepts a standard-array assignment", async () => {
    const res = await create({
      name: "CreateAbilityGen StandardArray",
      abilityGenerationMethod: "standardArray",
      abilityScores: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
    });
    expect(res.status).toBe(201);
    expect(res.body.abilityScores.strength).toBe(15);
  });

  it("rejects straight 20s under a claimed standard-array method", async () => {
    const res = await create({
      name: "CreateAbilityGen StandardArrayReject",
      abilityGenerationMethod: "standardArray",
      abilityScores: STRAIGHT_TWENTIES,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/standard array/i);
  });

  it("accepts a point-buy set within budget", async () => {
    const res = await create({
      name: "CreateAbilityGen PointBuy",
      abilityGenerationMethod: "pointBuy",
      abilityScores: { strength: 15, dexterity: 14, constitution: 13, intelligence: 8, wisdom: 8, charisma: 8 },
    });
    expect(res.status).toBe(201);
  });

  it("rejects straight 20s under a claimed point-buy method (over the 15 ceiling)", async () => {
    const res = await create({
      name: "CreateAbilityGen PointBuyReject",
      abilityGenerationMethod: "pointBuy",
      abilityScores: STRAIGHT_TWENTIES,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 and 15/);
  });

  it("rejects a point-buy set that overspends the 27-point budget", async () => {
    const res = await create({
      name: "CreateAbilityGen PointBuyOverspend",
      abilityGenerationMethod: "pointBuy",
      abilityScores: { strength: 15, dexterity: 15, constitution: 15, intelligence: 15, wisdom: 15, charisma: 15 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/budget/i);
  });

  it("accepts a rolled score set within the 3-18 range", async () => {
    const res = await create({
      name: "CreateAbilityGen Roll",
      abilityGenerationMethod: "roll",
      abilityScores: { strength: 18, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 3 },
    });
    expect(res.status).toBe(201);
  });

  it("rejects a rolled score above 18 (impossible from 4d6-drop-lowest)", async () => {
    const res = await create({
      name: "CreateAbilityGen RollReject",
      abilityGenerationMethod: "roll",
      abilityScores: { strength: 19, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/3 and 18/);
  });

  it("accepts a manual score set within the 1-30 sanity bound", async () => {
    const res = await create({
      name: "CreateAbilityGen Manual",
      abilityGenerationMethod: "manual",
      abilityScores: { strength: 18, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
    });
    expect(res.status).toBe(201);
  });

  it("rejects a manual score above 30", async () => {
    const res = await create({
      name: "CreateAbilityGen ManualReject",
      abilityGenerationMethod: "manual",
      abilityScores: { strength: 31, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1 and 30/);
  });

  it("applies the same 1-30 sanity bound when no method is declared", async () => {
    const accepted = await create({
      name: "CreateAbilityGen NoMethod",
      abilityScores: { strength: 18, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
    });
    expect(accepted.status).toBe(201);

    const rejected = await create({
      name: "CreateAbilityGen NoMethodReject",
      abilityScores: { strength: 99, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    });
    expect(rejected.status).toBe(400);
  });
});
