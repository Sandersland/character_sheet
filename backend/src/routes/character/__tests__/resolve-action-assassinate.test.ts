import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-resolve-action-assassinate";
const CATALOG_CLASS_NAME = "Resolve Action Assassinate Test Rogue";
let COOKIE: string;

const FIXTURE_ID = "test-resolve-action-assassinate-character";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Resolve Action Assassinate Test Rogue",
  alignment: "Chaotic Neutral",
  experiencePoints: 0,
  initiativeBonus: 3,
  speed: 30,
  hitPoints: { current: 20, max: 20, temp: 0 },
  hitDice: { total: 3, die: "d8" },
  abilityScores: {
    strength: 8,
    dexterity: 18,
    constitution: 12,
    intelligence: 12,
    wisdom: 10,
    charisma: 10,
  },
  savingThrowProficiencies: ["dexterity", "intelligence"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
};

function assassinateOp(actionId = "action-1") {
  return {
    type: "resolveAction" as const,
    actionId,
    source: "Dagger",
    cost: { kind: "action" as const },
    toHit: { faces: [15], kept: 15, nat20: false, bonus: 5, total: 20, verdict: "crit" as const },
    effect: { spec: "2d4+4", faces: [4, 3], total: 11, type: "piercing", kind: "damage" as const, crit: true },
    assassinate: true,
  };
}

function plainOp(actionId = "action-2") {
  return {
    type: "resolveAction" as const,
    actionId,
    source: "Dagger",
    cost: { kind: "action" as const },
    toHit: { faces: [12], kept: 12, nat20: false, bonus: 5, total: 17, verdict: "hit" as const },
    effect: { spec: "1d4+4", faces: [3], total: 7, type: "piercing", kind: "damage" as const, crit: false },
  };
}

function post(operations: unknown[]) {
  return supertest.agent(app).set("Cookie", COOKIE)
    .post(`/api/characters/${FIXTURE_ID}/resolve-action/transactions`)
    .send({ operations });
}

function activity() {
  return supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}/activity`);
}

async function createFixture(level: number, subclass: string, rulesEdition: "EDITION_2014" | "EDITION_2024", classId: string) {
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      ownerId: OWNER_ID,
      rulesEdition,
      classEntries: {
        create: [{ name: "rogue", classId, position: 0, level, subclass }],
      },
    },
  });
}

describe("POST /api/characters/:id/resolve-action/transactions — Assassinate (#1526)", () => {
  let rogueClassId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: CATALOG_CLASS_NAME },
      create: {
        name: CATALOG_CLASS_NAME,
        hitDie: "d8",
        savingThrows: ["dexterity", "intelligence"],
        skillChoiceCount: 4,
        skillChoices: ["stealth"],
      },
      update: {},
    });
    rogueClassId = cls.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
    await prisma.characterClass.deleteMany({ where: { name: CATALOG_CLASS_NAME } });
  });

  it("a 2014 Assassin L3 may declare Assassinate — the event carries assassinate: true and a crit effect", async () => {
    await createFixture(3, "Assassin", "EDITION_2014", rogueClassId);

    const res = await post([assassinateOp()]);
    expect(res.status).toBe(200);

    const act = await activity();
    const event = act.body.find((e: { data?: { actionId?: string } }) => e.data?.actionId === "action-1");
    expect(event.data.assassinate).toBe(true);
    expect(event.data.toHit.verdict).toBe("crit");
    expect(event.data.effect.crit).toBe(true);
  });

  it("toggle changes only that swing — a later non-toggled swing is a normal hit, not a crit", async () => {
    await createFixture(3, "Assassin", "EDITION_2014", rogueClassId);

    await post([assassinateOp()]);
    const res = await post([plainOp()]);
    expect(res.status).toBe(200);

    const act = await activity();
    const event = act.body.find((e: { data?: { actionId?: string } }) => e.data?.actionId === "action-2");
    expect(event.data.assassinate).toBe(false);
    expect(event.data.toHit.verdict).toBe("hit");
    expect(event.data.effect.crit).toBe(false);
  });

  it("400s when assassinate is true but the toHit verdict isn't crit (schema consistency)", async () => {
    await createFixture(3, "Assassin", "EDITION_2014", rogueClassId);

    const op = assassinateOp();
    const res = await post([{ ...op, toHit: { ...op.toHit, verdict: "hit" } }]);
    expect(res.status).toBe(400);
  });

  it("400s Assassinate from a 2014 rogue below L3", async () => {
    await createFixture(2, "Assassin", "EDITION_2014", rogueClassId);

    const res = await post([assassinateOp()]);
    expect(res.status).toBe(400);
  });

  it("400s Assassinate from a non-Assassin 2014 rogue (Thief)", async () => {
    await createFixture(3, "Thief", "EDITION_2014", rogueClassId);

    const res = await post([assassinateOp()]);
    expect(res.status).toBe(400);
  });

  // The eligibility gate, not just the frontend toggle's visibility, must reject a crafted request bypassing the UI (#1526).
  it("400s Assassinate from a 2024 Assassin L3 — SRD 5.2/PHB'24 deleted the auto-crit clause", async () => {
    await createFixture(3, "Assassin", "EDITION_2024", rogueClassId);

    const res = await post([assassinateOp()]);
    expect(res.status).toBe(400);
  });

  it("does not alter critRange — the character's served crit threshold stays the default 20 after declaring Assassinate", async () => {
    await createFixture(3, "Assassin", "EDITION_2014", rogueClassId);

    const res = await post([assassinateOp()]);
    expect(res.status).toBe(200);
    expect(res.body.critRange).toBe(20);
  });
});
