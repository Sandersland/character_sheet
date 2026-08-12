/**
 * Quivering Palm route tests (#1245). A level-17 Warrior of the Open Hand
 * (Wis 16, prof +6) has focus DC 17. Set spends 4 focus and marks vibrations
 * active; Trigger requires an active set, rolls a flat d20 Con save vs the DC,
 * halves the client-rolled 10d12 on a success, and clears the active flag.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { readPinnedEvents } from "@/test-support/events.js";
import { authCookie } from "@/test-support/auth.js";
import { QUIVERING_PALM_LEVEL } from "@/lib/classes/quivering-palm.js";

const OWNER_ID = "owner-quivering-palm";
let COOKIE: string;
const FIXTURE_ID = "test-quivering-palm-character-1";
const CLASS_NAME = "Quivering Palm Route Test Monk";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Quivering Palm Test Monk",
  alignment: "Lawful Neutral",
  experiencePoints: 225000, // level 17 → proficiency +6
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 120, max: 120, temp: 0 },
  hitDice: { total: 17, die: "d8" },
  abilityScores: { strength: 10, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 16, charisma: 10 },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}
const url = `/api/characters/${FIXTURE_ID}/abilities/quivering-palm/transactions`;

async function createMonk(level: number, subclass?: string, rulesEdition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024") {
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false },
    update: {},
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

describe("POST /api/characters/:id/abilities/quivering-palm/transactions", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createMonk(17, "Warrior of the Open Hand");
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("setQuiveringPalm spends 4 focus and marks vibrations active for 17 days", async () => {
    const res = await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.active).toBe(true);
    expect(result.daysRemaining).toBe(17);

    const focusPool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focusPool.remaining).toBe(13); // 17 total − 4 spent
    expect(res.body.character.quiveringPalm).toEqual({ saveDC: 17, active: true });
  });

  // #1275 byte-identity oracle: captured on the per-feature URL before the move to
  // the shared ability endpoint, so a green run afterwards is evidence the audit
  // trail is unchanged.
  it("pins the audit trail of one setQuiveringPalm", async () => {
    const res = await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(res.status).toBe(200);

    const noResourcesUsed = {
      resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: [], expertiseKnown: [], choicesKnown: {}, advancements: [] },
    };
    const buff = {
      id: expect.any(String), key: "quiveringPalm", source: "Quivering Palm",
      target: "quiveringPalm", modifier: 0, duration: "while-active",
    };

    expect(await readPinnedEvents(FIXTURE_ID)).toEqual([
      {
        category: "effects",
        type: "buffApplied",
        summary: "Quivering Palm: +0 to quiveringPalm",
        before: { activeEffects: { buffs: [] } },
        after: { activeEffects: { buffs: [buff] } },
        data: { key: "quiveringPalm", target: "quiveringPalm", modifier: 0, sourceEntryId: null },
      },
      {
        category: "resources",
        type: "setQuiveringPalm",
        summary: "Quivering Palm — set imperceptible vibrations (lasts 17 days unless triggered or ended).",
        before: null,
        after: null,
        data: { daysRemaining: 17 },
      },
      {
        category: "resources",
        type: "spendResource",
        summary: "Spent 4 Focus Points — 13/17 remaining",
        before: noResourcesUsed,
        after: { resources: { ...noResourcesUsed.resources, used: { focus: 4 } } },
        data: { key: "focus", amount: 4, remaining: 13, roll: null },
      },
    ]);
  });

  it("cannot set again while already active ('only one creature at a time')", async () => {
    await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    const res = await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/only one creature/i);
  });

  it("triggerQuiveringPalm requires an active set", async () => {
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "triggerQuiveringPalm", roll: 60 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no vibrations/i);
  });

  it("triggerQuiveringPalm rolls a flat d20 vs DC 17, halves on success, and clears the active flag", async () => {
    await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "triggerQuiveringPalm", roll: 60 }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.dc).toBe(17);
    expect(result.saveRoll).toBeGreaterThanOrEqual(1);
    expect(result.saveRoll).toBeLessThanOrEqual(20);
    expect(result.rawDamage).toBe(60);
    if (result.outcome === "success") {
      expect(result.appliedDamage).toBe(30);
    } else {
      expect(result.appliedDamage).toBe(60);
    }
    expect(res.body.character.quiveringPalm).toEqual({ saveDC: 17, active: false });
  });

  it("triggering does not spend additional focus (only the Set spent 4)", async () => {
    await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "triggerQuiveringPalm", roll: 60 }] });
    const focusPool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focusPool.remaining).toBe(13); // unchanged from the Set spend
  });
});

describe("Quivering Palm for an under-level or off-subclass monk", () => {
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

  it("rejects a level-16 Warrior of the Open Hand (below the L17 gate)", async () => {
    await createMonk(16, "Warrior of the Open Hand");
    const res = await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/open hand/i);
  });

  it("rejects a level-17+ monk of a different subclass", async () => {
    await createMonk(20, "Warrior of Shadow");
    const res = await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/open hand/i);
  });

  // #1277: isWarriorOfTheOpenHand used to substring-match ("open hand"), so a
  // homebrew name merely CONTAINING "Open Hand" inherited real Warrior of the
  // Open Hand mechanics.
  it("rejects a homebrew name containing \"Open Hand\" that isn't the real subclass", async () => {
    await createMonk(20, "Warrior of the Open Handbook");
    const res = await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/open hand/i);
  });
});

// #1501: the 2014 counterpart — Way of the Open Hand, a SEPARATE subclass.
// Set spends 3 KI (not 4 focus); Trigger's outcome mapping is INVERTED from
// 2024's (fail drops to 0 HP, success takes the full rolled damage).
describe("Quivering Palm for a 2014 Way of the Open Hand monk (#1501)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createMonk(17, "Way of the Open Hand", "EDITION_2014");
  });
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  it("setQuiveringPalm spends 3 ki (not 4 focus) and marks vibrations active for 17 days", async () => {
    const res = await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.active).toBe(true);
    expect(result.daysRemaining).toBe(17);

    const kiPool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "ki");
    expect(kiPool.remaining).toBe(14); // 17 total − 3 spent
  });

  it("triggerQuiveringPalm: a failed save reports dropping to 0 HP, ignoring rawDamage", async () => {
    await agent().post(url).send({ operations: [{ type: "setQuiveringPalm" }] });
    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "triggerQuiveringPalm", roll: 60 }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.rawDamage).toBe(60);
    if (result.outcome === "fail") {
      expect(result.appliedDamage).toBe(0);
      expect(result.summary).toMatch(/dropped to 0 hit points/i);
    } else {
      // success: FULL damage, never halved (inverted from 2024's shape)
      expect(result.appliedDamage).toBe(60);
      expect(result.summary).toMatch(/necrotic/i);
    }
  });
});

// #1337: hasQuiveringPalm is the single source of the L17 gate — both the
// serialized rider and this route's cast guard read it. Proven with a
// Fighter/Warrior-of-the-Open-Hand multiclass whose TOTAL character level is
// held CONSTANT across the two fixtures — only the monk entry's own level
// moves across the gate, so the assertion cannot pass on `character.level`.
describe("Quivering Palm multiclass entry-scoping (#1337)", () => {
  const MULTICLASS_ID = "test-quivering-palm-multiclass-1";
  const multiclassUrl = `/api/characters/${MULTICLASS_ID}/abilities/quivering-palm/transactions`;
  // Arbitrary total held constant across both fixtures below (must exceed
  // QUIVERING_PALM_LEVEL so the "below the gate" fixture's fighter level
  // stays positive).
  const TOTAL_LEVEL = 18;

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
        experiencePoints: 305000, // total level 18 in BOTH fixtures below
        classEntries: {
          create: [
            { name: "fighter", position: 0, level: fighterLevel },
            { name: "monk", position: 1, level: monkLevel, subclass: "Warrior of the Open Hand" },
          ],
        },
      },
    });
  }

  it("Fighter/Monk(Open Hand) below the gate [total level held constant]: no Quivering Palm rider, and the guard rejects", async () => {
    const monkLevel = QUIVERING_PALM_LEVEL - 1;
    await createFighterMonk(TOTAL_LEVEL - monkLevel, monkLevel);

    const character = await agent().get(`/api/characters/${MULTICLASS_ID}`);
    expect(character.body).not.toHaveProperty("quiveringPalm");

    const guard = await agent().post(multiclassUrl).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(guard.status).toBe(400);
    expect(guard.body.error).toMatch(/open hand/i);
  });

  it("Fighter/Monk(Open Hand) at the gate [total level held constant]: the Quivering Palm rider is present, and the guard admits", async () => {
    const monkLevel = QUIVERING_PALM_LEVEL;
    await createFighterMonk(TOTAL_LEVEL - monkLevel, monkLevel);

    const character = await agent().get(`/api/characters/${MULTICLASS_ID}`);
    expect(character.body).toHaveProperty("quiveringPalm");

    const guard = await agent().post(multiclassUrl).send({ operations: [{ type: "setQuiveringPalm" }] });
    expect(guard.status).toBe(200);
    expect(guard.body.character).toHaveProperty("quiveringPalm");
  });
});
