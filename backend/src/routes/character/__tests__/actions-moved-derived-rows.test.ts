/**
 * Route-level cast tests for the eight DERIVED_ACTIONS entries #1909 moved
 * onto their class's own ClassFeature rows (bardicInspiration, wildShape,
 * divineSense, layOnHands x2, metamagic x2, channelDivinity) — proving the
 * WRITE path (POST /api/characters/:id/actions/transactions) stays
 * byte-identical, exactly as the issue's own comment on
 * applyActionOpInTx/ACTION_EFFECT_FN promises: the route checks
 * `ACTION_EFFECT_FN[op.actionKey]` BEFORE the row-driven path, so nothing
 * about moving these keys off DERIVED_ACTIONS changes how casting them
 * spends/heals. Mirrors actions-rage.test.ts's pattern: real seeded classIds
 * (a bespoke test-only CharacterClass carries no ClassFeature rows of its
 * own, so a row-driven action would never appear for one), one character per
 * describe block, deleted in afterEach.
 *
 * The Cleric 2 / Paladin 3 multiclass "exactly one channelDivinity card, one
 * merged pool" regression (#1340) already has dedicated route coverage in
 * channel-divinity-multiclass.test.ts — not duplicated here.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-actions-moved-derived-rows-1909";
let COOKIE: string;

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}

function executeAction(characterId: string, actionKey: string, roll?: number) {
  return agent()
    .post(`/api/characters/${characterId}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey, ...(roll !== undefined ? { roll } : {}) }] });
}

interface Pool {
  key: string;
  total: number;
  used: number;
  remaining: number;
}

function pool(body: { resources: { pools: Pool[] } }, key: string): Pool {
  return body.resources.pools.find((p) => p.key === key)!;
}

const BASE = {
  alignment: "Neutral Good",
  initiativeBonus: 2,
  speed: 30,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

beforeEach(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

describe("POST /:id/actions/transactions — Bardic Inspiration (#1909, row-driven)", () => {
  const CHAR_ID = "test-1909-bard";

  beforeEach(async () => {
    const bardId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Bard" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        id: CHAR_ID,
        name: "1909 Bard",
        ownerId: OWNER_ID,
        experiencePoints: 0, // level 1
        hitPoints: { current: 8, max: 8, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 1, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 16 },
        classEntries: { create: [{ name: "bard", classId: bardId, position: 0, level: 1 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  });

  it("spends 1 bardicInspiration use (pool total 3 — max(1, +3 Cha mod) — still resourceFn-derived, #1909 only added the row-driven ACTION)", async () => {
    const res = await executeAction(CHAR_ID, "bardicInspiration");
    expect(res.status).toBe(200);
    expect(pool(res.body, "bardicInspiration")).toMatchObject({ total: 3, used: 1, remaining: 2 });
  });

  it("rejects a fourth use once the pool is exhausted", async () => {
    await executeAction(CHAR_ID, "bardicInspiration");
    await executeAction(CHAR_ID, "bardicInspiration");
    await executeAction(CHAR_ID, "bardicInspiration");
    const fourth = await executeAction(CHAR_ID, "bardicInspiration");
    expect(fourth.status).toBe(400);
  });
});

describe("POST /:id/actions/transactions — Wild Shape (#1909, row-driven)", () => {
  const CHAR_ID = "test-1909-druid";

  beforeEach(async () => {
    const druidId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Druid" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        id: CHAR_ID,
        name: "1909 Druid",
        ownerId: OWNER_ID,
        experiencePoints: 300, // level 2
        hitPoints: { current: 15, max: 15, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "druid", classId: druidId, position: 0, level: 2 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  });

  it("spends 1 wildShape use (EDITION_2024 default, pool total 2 at level 2)", async () => {
    const res = await executeAction(CHAR_ID, "wildShape");
    expect(res.status).toBe(200);
    expect(pool(res.body, "wildShape")).toMatchObject({ total: 2, used: 1, remaining: 1 });
  });
});

describe("POST /:id/actions/transactions — Paladin base pools (#1909, row-driven, EDITION_2014)", () => {
  const CHAR_ID = "test-1909-paladin-2014";

  beforeEach(async () => {
    const paladinId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Paladin" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        id: CHAR_ID,
        name: "1909 Paladin 2014",
        rulesEdition: "EDITION_2014",
        ownerId: OWNER_ID,
        experiencePoints: 900, // level 3
        hitPoints: { current: 10, max: 28, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 14 },
        classEntries: { create: [{ name: "paladin", classId: paladinId, position: 0, level: 3 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  });

  it("divineSense spends 1 use (EDITION_2014-only pool, total 1 + Cha mod = 3)", async () => {
    const res = await executeAction(CHAR_ID, "divineSense");
    expect(res.status).toBe(200);
    expect(pool(res.body, "divineSense")).toMatchObject({ total: 3, used: 1, remaining: 2 });
  });

  it("layOnHands spends a VARIABLE amount and heals it (pool total 5 x level 3 = 15)", async () => {
    const res = await executeAction(CHAR_ID, "layOnHands", 7);
    expect(res.status).toBe(200);
    expect(pool(res.body, "layOnHands")).toMatchObject({ total: 15, used: 7, remaining: 8 });
    expect(res.body.hitPoints.current).toBe(17); // 10 + 7
  });

  it("layOnHands with no roll (amount 0) 400s — spendResource rejects a non-positive amount (pre-existing resources.ts guard, unrelated to #1909)", async () => {
    const res = await executeAction(CHAR_ID, "layOnHands");
    expect(res.status).toBe(400);
  });

  it("channelDivinity spends 1 use (EDITION_2014 pool, total 1 at level 3)", async () => {
    const res = await executeAction(CHAR_ID, "channelDivinity");
    expect(res.status).toBe(200);
    expect(pool(res.body, "channelDivinity")).toMatchObject({ total: 1, used: 1, remaining: 0 });
  });
});

describe("POST /:id/actions/transactions — Paladin Lay on Hands cost fork (#1909, EDITION_2024)", () => {
  const CHAR_ID = "test-1909-paladin-2024";

  beforeEach(async () => {
    const paladinId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Paladin" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        id: CHAR_ID,
        name: "1909 Paladin 2024",
        ownerId: OWNER_ID,
        experiencePoints: 0, // level 1
        hitPoints: { current: 5, max: 12, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 1, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 14 },
        classEntries: { create: [{ name: "paladin", classId: paladinId, position: 0, level: 1 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  });

  // Cost forks to a Bonus Action in 2024 (SRD 5.2) — availableActions[]'s own
  // `cost` field is what actually carries this, not the spend mechanics
  // (identical write path either edition); checked here alongside the spend
  // to keep the edition-fork assertion next to its own fixture.
  it("layOnHands availableActions reports cost bonusAction (2024), and the spend/heal is unchanged", async () => {
    const sheet = await agent().get(`/api/characters/${CHAR_ID}`);
    const card = (sheet.body.availableActions as { key: string; cost: string }[]).find((a) => a.key === "layOnHands");
    expect(card?.cost).toBe("bonusAction");

    const res = await executeAction(CHAR_ID, "layOnHands", 5);
    expect(res.status).toBe(200);
    expect(pool(res.body, "layOnHands")).toMatchObject({ total: 5, used: 5, remaining: 0 });
    expect(res.body.hitPoints.current).toBe(10); // 5 + 5
  });
});

describe("POST /:id/actions/transactions — Metamagic (#1909, row-driven, enablement-fix consumer)", () => {
  const CHAR_ID = "test-1909-sorcerer";

  beforeEach(async () => {
    const sorcererId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Sorcerer" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        id: CHAR_ID,
        name: "1909 Sorcerer",
        rulesEdition: "EDITION_2014",
        ownerId: OWNER_ID,
        experiencePoints: 900, // level 3 — PHB'14 grants Metamagic at 3
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d6", spent: 0 },
        abilityScores: { strength: 8, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 16 },
        classEntries: { create: [{ name: "sorcerer", classId: sorcererId, position: 0, level: 3 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  });

  // Metamagic's identity ("metamagic") differs from its cost pool
  // ("sorceryPoints") — the actionFromRow enablement fix's real-world
  // consumer. A >1-point spend (Twinned Spell, level x2 SP) exercises the
  // variable-amount op the same way layOnHands' own variable spend does.
  it("spends MORE THAN 1 Sorcery Point (a >1-point Metamagic option, e.g. Twinned Spell) off the sorceryPoints pool, not an identity-named one", async () => {
    const res = await executeAction(CHAR_ID, "metamagic", 2);
    expect(res.status).toBe(200);
    expect(pool(res.body, "sorceryPoints")).toMatchObject({ total: 3, used: 2, remaining: 1 });
    // No phantom "metamagic" pool is ever created — identity-only resourceKey.
    expect(res.body.resources.pools.some((p: Pool) => p.key === "metamagic")).toBe(false);
  });

  it("availableActions reports metamagic as enabled/disabled off the sorceryPoints pool (the enablement-fix's own regression pin)", async () => {
    await executeAction(CHAR_ID, "metamagic", 3); // spend all 3 remaining sorceryPoints
    const sheet = await agent().get(`/api/characters/${CHAR_ID}`);
    const card = (sheet.body.availableActions as { key: string; enabled: boolean; disabledReason?: string }[]).find(
      (a) => a.key === "metamagic",
    );
    expect(card?.enabled).toBe(false);
    expect(card?.disabledReason).toBe("No sorceryPoints remaining");
  });
});

describe("POST /:id/actions/transactions — Cleric Channel Divinity (#1909, row-driven, single-class)", () => {
  const CHAR_ID = "test-1909-cleric";

  beforeEach(async () => {
    const clericId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Cleric" } })).id;
    await prisma.character.create({
      data: {
        ...BASE,
        id: CHAR_ID,
        name: "1909 Cleric",
        ownerId: OWNER_ID,
        experiencePoints: 300, // level 2
        hitPoints: { current: 16, max: 16, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "cleric", classId: clericId, position: 0, level: 2 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  });

  it("spends 1 channelDivinity use (EDITION_2024 default, pool total 2 at level 2)", async () => {
    const res = await executeAction(CHAR_ID, "channelDivinity");
    expect(res.status).toBe(200);
    expect(pool(res.body, "channelDivinity")).toMatchObject({ total: 2, used: 1, remaining: 1 });
  });

  it("the card served is named the real 2024 feature name \"Channel Divinity\" (not a hardcoded DERIVED_ACTIONS string)", async () => {
    const sheet = await agent().get(`/api/characters/${CHAR_ID}`);
    const card = (sheet.body.availableActions as { key: string; name: string }[]).find((a) => a.key === "channelDivinity");
    expect(card?.name).toBe("Channel Divinity");
  });
});
