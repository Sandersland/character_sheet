/**
 * Open Hand Technique route tests (#1245). A level-3 Warrior of the Open Hand
 * (Wis 16, prof +2) has focus DC 13; Addle never rolls; Push/Topple roll a
 * flat d20 vs the DC and apply on a fail, resist on a success. Non-subclass /
 * below-level monks (and non-monks) have no Open Hand Technique.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { readPinnedEvents } from "@/test-support/events.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-open-hand-technique";
let COOKIE: string;
const FIXTURE_ID = "test-open-hand-technique-character-1";
const CLASS_NAME = "Open Hand Technique Route Test Monk";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Open Hand Technique Test Monk",
  alignment: "Lawful Neutral",
  experiencePoints: 900, // level 3 → proficiency +2
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 24, max: 24, temp: 0 },
  hitDice: { total: 3, die: "d8" },
  abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}
const url = `/api/characters/${FIXTURE_ID}/abilities/open-hand-technique/transactions`;

async function createMonk(level: number, subclass?: string) {
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false },
    update: {},
  });
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "monk", classId: cls.id, position: 0, level, subclass }] },
    },
  });
}

describe("POST /api/characters/:id/abilities/open-hand-technique/transactions", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createMonk(3, "Warrior of the Open Hand");
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("addle always applies with no roll", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.rider).toBe("addle");
    expect(result.roll).toBeUndefined();
    expect(result.outcome).toBe("applied");
    expect(result.summary).toMatch(/no save/i);
  });

  // #1275 byte-identity oracle: captured on the per-feature URL before the move to
  // the shared ability endpoint, so a green run afterwards is evidence the audit
  // trail is unchanged.
  it("pins the audit trail of one Addle rider (the roll-free branch)", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    expect(res.status).toBe(200);

    expect(await readPinnedEvents(FIXTURE_ID)).toEqual([
      {
        category: "resources",
        type: "imposeOpenHandRider",
        summary:
          "Open Hand Technique — Addle (no save): the target can't take reactions until the start of your next turn.",
        before: null,
        after: null,
        data: { rider: "addle", dc: 13, roll: null, outcome: "applied" },
      },
    ]);
  });

  it("push rolls a flat d20 vs DC 13 (Wis 16, prof +2) and is internally consistent", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "push", usedThisTurn: false }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.dc).toBe(13);
    expect(result.roll).toBeGreaterThanOrEqual(1);
    expect(result.roll).toBeLessThanOrEqual(20);
    expect(result.outcome).toBe(result.roll < result.dc ? "applied" : "resisted");
  });

  it("topple rolls a flat d20 vs DC 13 and is internally consistent", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "topple", usedThisTurn: false }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.dc).toBe(13);
    expect(result.outcome).toBe(result.roll < result.dc ? "applied" : "resisted");
  });

  it("the once-per-turn guard rejects a second rider in the same turn", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: true }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/once per turn/i);
  });

  it("spends no focus (the rider rides free on a Flurry hit)", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    const focusPool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focusPool.remaining).toBe(focusPool.total);
  });
});

describe("Open Hand Technique for an under-level or off-subclass monk", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("rejects a level-2 Warrior of the Open Hand (below the L3 gate)", async () => {
    await createMonk(2, "Warrior of the Open Hand");
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/warrior of the open hand/i);
  });

  it("rejects a level-3+ monk of a different subclass", async () => {
    await createMonk(5, "Warrior of Shadow");
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/warrior of the open hand/i);
  });

  // #1277: isWarriorOfTheOpenHand used to substring-match ("open hand"), so a
  // homebrew name merely CONTAINING "Open Hand" inherited real Warrior of the
  // Open Hand mechanics — the same failure class #1339 fixed at the
  // DERIVED_ACTIONS gate (actions.test.ts's "Warrior of the Open Handbook"
  // fixture, not reachable through this route until this gate is fixed too).
  it("rejects a homebrew name containing \"Open Hand\" that isn't the real subclass", async () => {
    await createMonk(5, "Warrior of the Open Handbook");
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/warrior of the open hand/i);
  });
});

// #1277: resolveSubclassSlug prefers the catalog FK over the freeform display
// name. FK-fixture twin of the same test in hand-of-harm.test.ts, which
// asserts the opposite outcome for the SAME character shape.
describe("Open Hand Technique prefers the subclass catalog FK over a misleading display name (#1277)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("rejects Open Hand Technique when subclassId points at the real Warrior of Mercy row, even though the display name says Open Hand", async () => {
    const cls = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME },
      create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false },
      update: {},
    });
    const mercy = await prisma.subclass.findFirstOrThrow({ where: { slug: "monk-warrior-of-mercy" } });
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        ownerId: OWNER_ID,
        classEntries: {
          create: [{ name: "monk", classId: cls.id, position: 0, level: 5, subclass: "Warrior of the Open Handbook", subclassId: mercy.id }],
        },
      },
    });
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/warrior of the open hand/i);
  });
});
