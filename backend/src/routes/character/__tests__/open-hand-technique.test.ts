import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { readPinnedEvents } from "@/test-support/events.js";
import { authCookie } from "@/test-support/auth.js";
import { OPEN_HAND_TECHNIQUE_LEVEL } from "@/lib/classes/open-hand-technique.js";

const OWNER_ID = "owner-open-hand-technique";
let COOKIE: string;
const FIXTURE_ID = "test-open-hand-technique-character-1";
const CLASS_NAME = "Open Hand Technique Route Test Monk";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Open Hand Technique Test Monk",
  alignment: "Lawful Neutral",
  experiencePoints: 900,
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

async function createMonk(level: number, subclass?: string, rulesEdition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024") {
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false },
    update: {},
  });
  await prisma.classFeature.deleteMany({ where: { classId: cls.id, subclassId: null } });
  const [poolName, poolKey, poolLabel] = rulesEdition === "EDITION_2014" ? (["Ki", "ki", "Ki Points"] as const) : (["Focus", "focus", "Focus Points"] as const);
  await prisma.classFeature.create({
    data: {
      classId: cls.id, subclassId: null, name: poolName, level: 2, edition: rulesEdition,
      description: `You have a pool of ${poolLabel} equal to your monk level.`,
      resourceKey: poolKey, resourceLabel: poolLabel, resourceRecharge: "short-or-long",
      resourceTotals: [{ minLevel: 2, total: { levelTimes: 1 } }],
    },
  });
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      ownerId: OWNER_ID,
      rulesEdition,
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

  it("pins the audit trail of one Addle rider (the roll-free branch)", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    expect(res.status).toBe(200);

    expect(await readPinnedEvents(FIXTURE_ID)).toEqual([
      {
        category: "resources",
        type: "imposeOpenHandRider",
        // SRD 5.2: target "can't make Opportunity Attacks" until the start of its next turn.
        summary:
          "Open Hand Technique — Addle (no save): the target can't make Opportunity Attacks until the start of its next turn.",
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
    expect(res.body.error).toMatch(/open hand/i);
  });

  it("rejects a level-3+ monk of a different subclass", async () => {
    await createMonk(5, "Warrior of Shadow");
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/open hand/i);
  });

  it("rejects a homebrew name containing \"Open Hand\" that isn't the real subclass", async () => {
    await createMonk(5, "Warrior of the Open Handbook");
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/open hand/i);
  });
});

describe("Open Hand Technique for a 2014 Way of the Open Hand monk (#1501)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createMonk(3, "Way of the Open Hand", "EDITION_2014");
  });
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("addle reports the 2014 wording (ends at the end of your next turn, covers all reactions)", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.summary).toBe(
      "Open Hand Technique — Addle (no save): the target can't take reactions until the end of your next turn.",
    );
  });

  it("push/topple are unaffected by the edition fork — same DC formula, same outcome logic", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "push", usedThisTurn: false }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.dc).toBe(13);
  });
});

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
    expect(res.body.error).toMatch(/open hand/i);
  });
});

// hasOpenHandTechnique is the single source of the L3 gate; the fixtures below hold TOTAL character level constant and move only the monk entry's own level, so the assertion cannot pass on character.level.
describe("Open Hand Technique multiclass entry-scoping (#1337)", () => {
  const MULTICLASS_ID = "test-open-hand-technique-multiclass-1";
  const multiclassUrl = `/api/characters/${MULTICLASS_ID}/abilities/open-hand-technique/transactions`;
  // Must exceed OPEN_HAND_TECHNIQUE_LEVEL so the "below the gate" fixture's fighter level stays positive.
  const TOTAL_LEVEL = 17;

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: MULTICLASS_ID } });
  });

  async function createFighterMonk(fighterLevel: number, monkLevel: number) {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: MULTICLASS_ID,
        ownerId: OWNER_ID,
        experiencePoints: 225000, // total level 17 in BOTH fixtures below
        classEntries: {
          create: [
            { name: "fighter", position: 0, level: fighterLevel },
            { name: "monk", position: 1, level: monkLevel, subclass: "Warrior of the Open Hand" },
          ],
        },
      },
    });
  }

  it("Fighter/Monk(Open Hand) below the gate [total level held constant]: no Open Hand Technique rider, and the guard rejects", async () => {
    const monkLevel = OPEN_HAND_TECHNIQUE_LEVEL - 1;
    await createFighterMonk(TOTAL_LEVEL - monkLevel, monkLevel);

    const character = await agent().get(`/api/characters/${MULTICLASS_ID}`);
    expect(character.body).not.toHaveProperty("openHandTechnique");

    const guard = await agent()
      .post(multiclassUrl)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    expect(guard.status).toBe(400);
    expect(guard.body.error).toMatch(/open hand/i);
  });

  it("Fighter/Monk(Open Hand) at the gate [total level held constant]: the Open Hand Technique rider is present, and the guard admits", async () => {
    const monkLevel = OPEN_HAND_TECHNIQUE_LEVEL;
    await createFighterMonk(TOTAL_LEVEL - monkLevel, monkLevel);

    const character = await agent().get(`/api/characters/${MULTICLASS_ID}`);
    expect(character.body).toHaveProperty("openHandTechnique");

    const guard = await agent()
      .post(multiclassUrl)
      .send({ operations: [{ type: "imposeOpenHandRider", rider: "addle", usedThisTurn: false }] });
    expect(guard.status).toBe(200);
    expect(guard.body.character).toHaveProperty("openHandTechnique");
  });
});
