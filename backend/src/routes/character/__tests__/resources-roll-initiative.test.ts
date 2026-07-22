/**
 * rollInitiative route tests (#1243): Monk Uncanny Metabolism (L2, full Focus
 * refill once per long rest + an HP heal) and Perfect Focus (L15, top Focus up
 * to 4 every combat). Real Postgres + supertest, fixture style mirrors
 * shadow-arts-cast.test.ts (a plain monk needs no subclass/spell-catalog setup).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-roll-initiative";
let COOKIE: string;

const FIXTURE_ID = "test-roll-initiative-monk-1";
const CLASS_NAME = "Roll Initiative Test Monk";

// XP thresholds → monk level: L1=0, L2=300, L15=165000.
const XP_L1 = 0;
const XP_L2 = 300;
const XP_L15 = 165000;

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Roll Initiative Test Monk",
  alignment: "Neutral",
  initiativeBonus: 3,
  speed: 40,
  // Plenty of headroom above current so an Uncanny Metabolism heal (up to
  // monk level 15 + a d12 = 27) never clips against max.
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
  return supertest.agent(createApp()).set("Cookie", COOKIE);
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
    await createMonk(XP_L2, 2, 2); // Focus total 2, fully spent
    const res = await rollInitiative();
    expect(res.status).toBe(200);

    const focus = focusPool(res.body);
    expect(focus).toMatchObject({ used: 0, remaining: 2 });

    // Healed 2 (monk level) + 1d6 → [3, 8]. Started at 50 HP.
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

    // Spend Focus again mid-rest, then roll initiative for a second combat.
    await spendFocus(2);
    const second = await rollInitiative();
    expect(focusPool(second.body)).toMatchObject({ used: 2 }); // unchanged — no refill
    expect(second.body.hitPoints.current).toBe(hpAfterFirst); // no second heal
    expect(second.body.results[0].summary).toBe("Rolled Initiative — no resources to regain");

    await longRest();
    const third = await rollInitiative();
    expect(focusPool(third.body)).toMatchObject({ used: 0 }); // fires again after a long rest
    expect(third.body.results[0].summary).toContain("Uncanny Metabolism");
  });

  it("(b) L15: once Uncanny Metabolism has fired this rest, Perfect Focus tops Focus up to 4 with no second heal", async () => {
    await createMonk(XP_L15, 15, 15); // Focus total 15, fully spent
    const first = await rollInitiative();
    expect(focusPool(first.body)).toMatchObject({ used: 0 });
    const hpAfterFirst = first.body.hitPoints.current;

    // Spend down to 2 remaining (13 used) mid-rest, then roll initiative again.
    await spendFocus(13);
    const second = await rollInitiative();
    expect(focusPool(second.body)).toMatchObject({ used: 11, remaining: 4 }); // topped up to 4
    expect(second.body.hitPoints.current).toBe(hpAfterFirst); // no second heal this rest
    expect(second.body.results[0].summary).not.toContain("Uncanny Metabolism");
  });

  it("(c)/(d): a level-1 monk (below the Focus/Uncanny Metabolism gate) — rollInitiative is a no-op", async () => {
    await createMonk(XP_L1, 1, 0);
    const res = await rollInitiative();
    expect(res.status).toBe(200);
    expect(focusPool(res.body)).toBeUndefined();
    expect(res.body.results[0].summary).toBe("Rolled Initiative — no resources to regain");
    expect(res.body.hitPoints.current).toBe(50); // unchanged
  });
});
