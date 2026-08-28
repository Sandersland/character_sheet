import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { MONK_BASE_ROWS } from "@/lib/classes/__tests__/test-feature-rows.fixture.js";

const OWNER_ID = "owner-roll-initiative";
let COOKIE: string;

const FIXTURE_ID = "test-roll-initiative-monk-1";
const CLASS_NAME = "Roll Initiative Test Monk";

const XP_L1 = 0;
const XP_L2 = 300;
const XP_L15 = 165000;

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Roll Initiative Test Monk",
  alignment: "Neutral",
  initiativeBonus: 3,
  speed: 40,
  // max: 100 leaves headroom above current so an Uncanny Metabolism heal (up to monk level 15 + a d12) never clips.
  hitPoints: { current: 50, max: 100, temp: 0 },
  abilityScores: {
    strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 15, charisma: 10,
  },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: ["stealth"],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

interface Pool { key: string; used: number; remaining: number; total: number }
interface OpResult { eventType: string; summary: string; eventData: { regenerated: unknown[] } }

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}
const resourcesUrl = `/api/characters/${FIXTURE_ID}/resources/transactions`;
const hpUrl = `/api/characters/${FIXTURE_ID}/hp`;
const hpActivityUrl = `/api/characters/${FIXTURE_ID}/activity?category=hitPoints`;

async function rollInitiative() {
  return agent().post(resourcesUrl).send({ operations: [{ type: "rollInitiative" }] });
}
async function spendFocus(amount: number) {
  return agent().post(resourcesUrl).send({ operations: [{ type: "spendResource", key: "focus", amount }] });
}
async function longRest() {
  return agent().post(hpUrl).send({ operations: [{ type: "longRest" }] });
}
function focusPool(body: { resources: { pools: Pool[] } }): Pool | undefined {
  return body.resources.pools.find((p) => p.key === "focus");
}

let classId: string;

async function createMonk(experiencePoints: number, level: number, usedFocus: number) {
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      experiencePoints,
      hitDice: { total: level, die: "d8" },
      ownerId: OWNER_ID,
      resources: { used: { focus: usedFocus } } as Prisma.InputJsonValue,
      classEntries: { create: [{ name: "monk", classId, position: 0 }] },
    },
  });
}

describe("POST /api/characters/:id/resources/transactions — rollInitiative (Monk, #1243)", () => {
  beforeAll(async () => {
    const cls = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME },
      create: {
        name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"],
        skillChoiceCount: 2, skillChoices: ["acrobatics", "stealth"], isSpellcaster: false,
      },
      update: {},
    });
    classId = cls.id;

    // A level-1 base feature row must exist or deriveResources returns null for the below-gate case.
    const focusRow = MONK_BASE_ROWS.find((r) => r.name === "Focus" && r.edition === "EDITION_2024");
    if (!focusRow) throw new Error("fixture missing monk Focus/EDITION_2024 row");
    await prisma.classFeature.deleteMany({ where: { classId } });
    await prisma.classFeature.createMany({
      data: [
        { classId, subclassId: null, name: "Martial Arts", level: 1, edition: "EDITION_2024", description: "With unarmed strikes or monk weapons: use Dexterity instead of Strength for attack and damage rolls; deal 1d6 (L1–4), 1d8 (L5–10), 1d10 (L11–16), or 1d12 (L17+) damage; make one bonus unarmed strike after the Attack action." },
        { classId, subclassId: null, name: "Unarmored Defense", level: 1, edition: "EDITION_2024", description: "While not wearing armor or wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier." },
        {
          classId, subclassId: null, name: focusRow.name, level: focusRow.level, edition: focusRow.edition,
          description: focusRow.description,
          resourceKey: focusRow.resourceKey, resourceLabel: focusRow.resourceLabel, resourceRecharge: focusRow.resourceRecharge,
          resourceTotals: (focusRow.resourceTotals ?? []) as unknown as Prisma.InputJsonValue,
          resourceOnInitiative: (focusRow.resourceOnInitiative ?? []) as unknown as Prisma.InputJsonValue,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("(a) L2: fully refills Focus and heals monk level (2) + a Martial Arts d6 roll, once per long rest", async () => {
    await createMonk(XP_L2, 2, 2);
    const res = await rollInitiative();
    expect(res.status).toBe(200);

    const focus = focusPool(res.body);
    expect(focus).toMatchObject({ used: 0, remaining: 2 });

    // Started at 50 HP; heals 2 (monk level) + 1d6 → range [53, 58].
    expect(res.body.hitPoints.current).toBeGreaterThanOrEqual(53);
    expect(res.body.hitPoints.current).toBeLessThanOrEqual(58);

    const result: OpResult = res.body.results[0];
    expect(result.eventType).toBe("initiativeRegen");
    expect(result.summary).toContain("Uncanny Metabolism");

    const hpEvents = await agent().get(hpActivityUrl);
    expect(hpEvents.body[0].summary).toContain("Uncanny Metabolism healed");
    expect(hpEvents.body[0].summary).toContain("HP");
  });

  it("does not refill Focus or heal again in a second combat before a long rest, but does after one", async () => {
    await createMonk(XP_L2, 2, 2);
    const first = await rollInitiative();
    const hpAfterFirst = first.body.hitPoints.current;

    await spendFocus(2);
    const second = await rollInitiative();
    expect(focusPool(second.body)).toMatchObject({ used: 2 });
    expect(second.body.hitPoints.current).toBe(hpAfterFirst);
    expect(second.body.results[0].summary).toBe("Rolled Initiative — no resources to regain");

    await longRest();
    const third = await rollInitiative();
    expect(focusPool(third.body)).toMatchObject({ used: 0 });
    expect(third.body.results[0].summary).toContain("Uncanny Metabolism");
  });

  it("(b) L15: once Uncanny Metabolism has fired this rest, Perfect Focus tops Focus up to 4 with no second heal", async () => {
    await createMonk(XP_L15, 15, 15);
    const first = await rollInitiative();
    expect(focusPool(first.body)).toMatchObject({ used: 0 });
    const hpAfterFirst = first.body.hitPoints.current;

    await spendFocus(13);
    const second = await rollInitiative();
    expect(focusPool(second.body)).toMatchObject({ used: 11, remaining: 4 });
    expect(second.body.hitPoints.current).toBe(hpAfterFirst);
    expect(second.body.results[0].summary).not.toContain("Uncanny Metabolism");
  });

  it("(c)/(d): a level-1 monk (below the Focus/Uncanny Metabolism gate) — rollInitiative is a no-op", async () => {
    await createMonk(XP_L1, 1, 0);
    const res = await rollInitiative();
    expect(res.status).toBe(200);
    expect(focusPool(res.body)).toBeUndefined();
    expect(res.body.results[0].summary).toBe("Rolled Initiative — no resources to regain");
    expect(res.body.hitPoints.current).toBe(50);
  });
});
