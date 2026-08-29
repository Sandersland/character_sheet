import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-discipline-subclass-choice";
let COOKIE: string;
const FIXTURE_ID = "test-discipline-subclass-choice-1";

// XP thresholds: L3=900, L6=14000, L11=85000, L17=225000.
const XP_L3 = 900;
const XP_L6 = 14000;
const XP_L11 = 85000;
const XP_L17 = 225000;

const BASE = {
  id: FIXTURE_ID,
  name: "Discipline Subclass Choice Test Monk",
  alignment: "Neutral",
  initiativeBonus: 3,
  speed: 40,
  hitPoints: { current: 80, max: 80, temp: 0 },
  hitDice: { total: 17, die: "d8" },
  abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: ["stealth"],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

let classId: string;
let subclassId: string;
let fangsId: string;

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}

async function createMonk(experiencePoints: number, edition: "EDITION_2014" | "EDITION_2024", subclass: string | null) {
  await prisma.character.create({
    data: {
      ...BASE,
      experiencePoints,
      ownerId: OWNER_ID,
      rulesEdition: edition,
      resources: Prisma.JsonNull,
      classEntries: { create: [{ name: "monk", subclass, subclassId: subclass ? subclassId : null, classId, position: 0 }] },
    },
  });
}

describe("resources.subclassChoices — fourElementsDisciplines count progression (#1503)", () => {
  beforeAll(async () => {
    const cls = await prisma.characterClass.upsert({
      where: { name: "Discipline Subclass Choice Test Class" },
      create: {
        name: "Discipline Subclass Choice Test Class",
        hitDie: "d8",
        savingThrows: ["strength", "dexterity"],
        skillChoiceCount: 2,
        skillChoices: ["acrobatics", "stealth"],
        isSpellcaster: false,
      },
      update: {},
    });
    classId = cls.id;

    const existingSub = await prisma.subclass.findFirst({ where: { classId, slug: "disciplines-subclass-choice-route-test" } });
    const sub =
      existingSub ??
      (await prisma.subclass.create({
        data: { classId, name: "Way of the Four Elements Route Test", description: "Test fixture subclass.", slug: "disciplines-subclass-choice-route-test" },
      }));
    subclassId = sub.id;
    await prisma.classFeature.deleteMany({ where: { subclassId } });
    // Both editions, deliberately SYNTHETIC: production's real Disciple of the
    // Elements row is EDITION_2014-only. Seeding an EDITION_2024 partition here
    // lets the #1345 test below reach a 2024 character where the choice
    // resolves, exercising crossEditionRejection's option-level check.
    await prisma.classFeature.createMany({
      data: (["EDITION_2014", "EDITION_2024"] as const).map((edition) => ({
        classId, subclassId, name: "Disciple of the Elements", level: 3, edition,
        description: "row text",
        choiceKey: "fourElementsDisciplines", choiceLabel: "Elemental Disciplines", choiceCatalogSource: "discipline",
        choiceCountTiers: [
          { minLevel: 3, count: 1 },
          { minLevel: 6, count: 2 },
          { minLevel: 11, count: 3 },
          { minLevel: 17, count: 4 },
        ],
      })),
    });

    fangsId = (await prisma.grantedAbility.findFirstOrThrow({ where: { name: "Fangs of the Fire Snake" } })).id;
  });

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: "Discipline Subclass Choice Test Class" } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("reports count 1/2/3/4 at L3/6/11/17", async () => {
    for (const [xp, expectedCount] of [[XP_L3, 1], [XP_L6, 2], [XP_L11, 3], [XP_L17, 4]] as const) {
      await createMonk(xp, "EDITION_2014", "way of the four elements");
      const res = await agent().get(`/api/characters/${FIXTURE_ID}`);
      expect(res.status).toBe(200);
      const choice = (res.body.resources.subclassChoices as { key: string; count: number }[]).find(
        (c) => c.key === "fourElementsDisciplines",
      );
      expect(choice?.count, `L${xp}`).toBe(expectedCount);
      await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
    }
  });

  it("(#1345) rejects a 2014-tagged discipline optionId against a synthetic EDITION_2024 partition (production has no real 2024 partition)", async () => {
    await createMonk(XP_L3, "EDITION_2024", "way of the four elements");
    const res = await agent()
      .post(`/api/characters/${FIXTURE_ID}/resources/transactions`)
      .send({ operations: [{ type: "learnSubclassChoice", choiceKey: "fourElementsDisciplines", optionId: fangsId }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2014 rules/);
    expect(res.body.error).toMatch(/2024 rules/);
  });

  it("a 2014 character CAN learn the same discipline (sanity: the rejection above is edition-specific, not universal)", async () => {
    await createMonk(XP_L3, "EDITION_2014", "way of the four elements");
    const res = await agent()
      .post(`/api/characters/${FIXTURE_ID}/resources/transactions`)
      .send({ operations: [{ type: "learnSubclassChoice", choiceKey: "fourElementsDisciplines", optionId: fangsId }] });
    expect(res.status).toBe(200);
    expect(res.body.resources.choicesKnown.fourElementsDisciplines).toHaveLength(1);
  });
});
