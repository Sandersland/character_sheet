/**
 * Resources route characterization tests (issue #289).
 * Mirrors spellcasting.test.ts: real Postgres in beforeEach, supertest against
 * createApp(). The fixture is a level-3 Battle Master Fighter (Str 16) so the
 * superiority-die pool, maneuver choice count (3), and Student-of-War tool
 * choice count (1) are all deterministic. Locks the CURRENT behavior of
 * applyResourceOperations across all six op branches before any refactor.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-resources";
let COOKIE: string;

const FIXTURE_ID = "test-resources-character-1";
const FIGHTER_CATALOG_NAME = "Resources Route Test Fighter";
const MANEUVER_CATALOG_NAME = "Resources Route Test Trip Attack";

// Level-3 Battle Master Fighter. XP 900 → level 3 → prof bonus +2.
// Str 16 (+3). Superiority dice: 4 × d8. Maneuvers known cap: 3. Tool cap: 1.
const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Resources Test Battle Master",
  alignment: "Lawful Neutral",
  experiencePoints: 900,
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 28, max: 28, temp: 0 },
  hitDice: { total: 3, die: "d10" },
  abilityScores: {
    strength: 16,
    dexterity: 10,
    constitution: 14,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
};

const url = `/api/characters/${FIXTURE_ID}/resources/transactions`;
const activityUrl = `/api/characters/${FIXTURE_ID}/activity?category=resources`;

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
}

async function post(operations: unknown[]) {
  return agent().post(url).send({ operations });
}

// Serialized resource sub-state helpers (all read from the mutation response).
interface Pool { key: string; used: number; remaining: number; total: number }
interface Entry { id: string; name: string; maneuverId?: string }

function pool(res: { body: { resources: { pools: Pool[] } } }, key: string): Pool {
  return res.body.resources.pools.find((p) => p.key === key)!;
}
function maneuvers(res: { body: { resources: { maneuversKnown: Entry[] } } }): Entry[] {
  return res.body.resources.maneuversKnown;
}
function toolProfs(res: { body: { resources: { toolProficienciesKnown: Entry[] } } }): Entry[] {
  return res.body.resources.toolProficienciesKnown;
}

interface ActivityEvent {
  type: string;
  summary: string;
  data?: Record<string, unknown>;
  before?: { resources?: Record<string, unknown> };
  after?: { resources?: Record<string, unknown> };
  batchId?: string;
}
async function activity(): Promise<ActivityEvent[]> {
  const res = await agent().get(activityUrl);
  return res.body as ActivityEvent[];
}

describe("POST /api/characters/:id/resources/transactions", () => {
  let catalogManeuverId: string;

  afterAll(async () => {
    await prisma.grantedAbility.deleteMany({ where: { name: MANEUVER_CATALOG_NAME } });
    await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);

    const cls = await prisma.characterClass.upsert({
      where: { name: FIGHTER_CATALOG_NAME },
      create: {
        name: FIGHTER_CATALOG_NAME,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics", "intimidation"],
        isSpellcaster: false,
      },
      update: {},
    });

    const maneuver = await prisma.grantedAbility.upsert({
      where: { name: MANEUVER_CATALOG_NAME },
      create: {
        name: MANEUVER_CATALOG_NAME,
        source: "maneuver",
        description: "Knock a target prone on a hit.",
        placement: "damageRoll",
        saveAbility: "strength",
        costKind: "pool",
        costPoolKey: "superiorityDice",
        costBase: 1,
        effectDieSource: "superiorityDice",
      },
      update: {},
    });
    catalogManeuverId = maneuver.id;

    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "fighter", subclass: "battle master", classId: cls.id, position: 0 }],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  // ── Fixture derivation guard ──────────────────────────────────────────────

  it("derives a 4×d8 superiority pool, maneuver cap 3 and tool cap 1", async () => {
    const res = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect(res.status).toBe(200);
    const sd = pool(res, "superiorityDice");
    expect(sd.total).toBe(4);
    expect(res.body.resources.pools.find((p: Pool & { die?: string }) => p.key === "superiorityDice").die).toBe("d8");
    expect(res.body.resources.maneuverChoiceCount).toBe(3);
    expect(res.body.resources.toolProfChoiceCount).toBe(1);
    // Str 16 (+3), prof +2 → maneuver save DC 13.
    expect(res.body.resources.maneuverSaveDC).toBe(13);
  });

  // ── spendResource ─────────────────────────────────────────────────────────

  it("spendResource with a roll spends one die and logs the roll", async () => {
    const res = await post([{ type: "spendResource", key: "superiorityDice", roll: 5 }]);
    expect(res.status).toBe(200);
    expect(pool(res, "superiorityDice").used).toBe(1);
    expect(pool(res, "superiorityDice").remaining).toBe(3);

    const events = await activity();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("spendResource");
    expect(events[0].summary).toBe("Spent 1 Superiority Dice (rolled d8: 5) — 3/4 remaining");
    expect(events[0].data).toEqual({ key: "superiorityDice", amount: 1, roll: 5, remaining: 3 });
    expect((events[0].before!.resources as { used: Record<string, number> }).used).toEqual({});
    expect((events[0].after!.resources as { used: Record<string, number> }).used).toEqual({ superiorityDice: 1 });
  });

  it("spendResource without a roll omits the roll from the summary", async () => {
    const res = await post([{ type: "spendResource", key: "superiorityDice" }]);
    expect(res.status).toBe(200);
    expect(pool(res, "superiorityDice").used).toBe(1);

    const events = await activity();
    expect(events[0].summary).toBe("Spent 1 Superiority Dice — 3/4 remaining");
    expect(events[0].data).toEqual({ key: "superiorityDice", amount: 1, roll: null, remaining: 3 });
  });

  it("400s on spendResource with amount 0", async () => {
    const res = await post([{ type: "spendResource", key: "superiorityDice", amount: 0 }]);
    expect(res.status).toBe(400);
  });

  it("400s on spendResource for a key the subclass doesn't have", async () => {
    const res = await post([{ type: "spendResource", key: "notARealPool" }]);
    expect(res.status).toBe(400);
  });

  it("400s on spendResource that exceeds pool capacity", async () => {
    const res = await post([{ type: "spendResource", key: "superiorityDice", amount: 5 }]);
    expect(res.status).toBe(400);
  });

  // ── restoreResource ─────────────────────────────────────────────────────────

  it("restoreResource returns a spent die to the pool", async () => {
    await post([{ type: "spendResource", key: "superiorityDice" }]);
    const res = await post([{ type: "restoreResource", key: "superiorityDice" }]);
    expect(res.status).toBe(200);
    expect(pool(res, "superiorityDice").used).toBe(0);

    const events = await activity();
    const restore = events.find((e) => e.type === "restoreResource")!;
    expect(restore.summary).toBe("Restored 1 Superiority Dice — 4/4 remaining");
    expect(restore.data).toEqual({ key: "superiorityDice", amount: 1 });
  });

  it("400s on restoreResource when nothing is spent", async () => {
    const res = await post([{ type: "restoreResource", key: "superiorityDice" }]);
    expect(res.status).toBe(400);
  });

  // ── learnManeuver ─────────────────────────────────────────────────────────

  it("learnManeuver from catalog snapshots the maneuver and records provenance", async () => {
    const res = await post([{ type: "learnManeuver", maneuverId: catalogManeuverId }]);
    expect(res.status).toBe(200);
    const learned = maneuvers(res).find((m) => m.maneuverId === catalogManeuverId)!;
    expect(learned).toBeDefined();
    expect(learned.name).toBe(MANEUVER_CATALOG_NAME);

    const events = await activity();
    expect(events[0].type).toBe("learnManeuver");
    expect(events[0].summary).toBe(`Learned maneuver: ${MANEUVER_CATALOG_NAME}`);
    expect(events[0].data).toEqual({
      entryId: learned.id,
      maneuverName: MANEUVER_CATALOG_NAME,
      maneuverId: catalogManeuverId,
    });
  });

  it("learnManeuver with a custom payload has a null maneuverId", async () => {
    const res = await post([{ type: "learnManeuver", custom: { name: "Homebrew Feint", description: "Fake out a foe." } }]);
    expect(res.status).toBe(200);
    const learned = maneuvers(res).find((m) => m.name === "Homebrew Feint")!;
    expect(learned.maneuverId).toBeUndefined();

    const events = await activity();
    expect(events[0].data).toEqual({
      entryId: learned.id,
      maneuverName: "Homebrew Feint",
      maneuverId: null,
    });
  });

  it("400s on learnManeuver with both maneuverId and custom", async () => {
    const res = await post([{
      type: "learnManeuver",
      maneuverId: catalogManeuverId,
      custom: { name: "Overlap", description: "Oops." },
    }]);
    expect(res.status).toBe(400);
  });

  it("400s on learnManeuver with an unknown catalog id", async () => {
    const res = await post([{ type: "learnManeuver", maneuverId: "does-not-exist" }]);
    expect(res.status).toBe(400);
  });

  it("400s on duplicate learnManeuver (same catalog id twice)", async () => {
    await post([{ type: "learnManeuver", maneuverId: catalogManeuverId }]);
    const dup = await post([{ type: "learnManeuver", maneuverId: catalogManeuverId }]);
    expect(dup.status).toBe(400);
  });

  it("400s on learnManeuver once the choice count (3) is reached", async () => {
    await post([{ type: "learnManeuver", custom: { name: "M1", description: "d" } }]);
    await post([{ type: "learnManeuver", custom: { name: "M2", description: "d" } }]);
    await post([{ type: "learnManeuver", custom: { name: "M3", description: "d" } }]);
    const fourth = await post([{ type: "learnManeuver", custom: { name: "M4", description: "d" } }]);
    expect(fourth.status).toBe(400);
  });

  // ── forgetManeuver ──────────────────────────────────────────────────────────

  it("forgetManeuver removes a learned maneuver by entry id", async () => {
    const learn = await post([{ type: "learnManeuver", custom: { name: "Disarm", description: "d" } }]);
    const entryId = maneuvers(learn)[0].id;

    const res = await post([{ type: "forgetManeuver", entryId }]);
    expect(res.status).toBe(200);
    expect(maneuvers(res).find((m) => m.id === entryId)).toBeUndefined();

    const events = await activity();
    const forget = events.find((e) => e.type === "forgetManeuver")!;
    expect(forget.summary).toBe("Forgot maneuver: Disarm");
    expect(forget.data).toEqual({ entryId, maneuverName: "Disarm" });
  });

  it("400s on forgetManeuver for an unknown entry id", async () => {
    const res = await post([{ type: "forgetManeuver", entryId: "does-not-exist" }]);
    expect(res.status).toBe(400);
  });

  // ── learnToolProficiency ────────────────────────────────────────────────────

  it("learnToolProficiency adds an artisan tool via Student of War", async () => {
    const res = await post([{ type: "learnToolProficiency", name: "Carpenter's Tools" }]);
    expect(res.status).toBe(200);
    const learned = toolProfs(res).find((t) => t.name === "Carpenter's Tools")!;
    expect(learned).toBeDefined();

    const events = await activity();
    expect(events[0].type).toBe("learnToolProficiency");
    expect(events[0].summary).toBe("Learned tool proficiency: Carpenter's Tools (Student of War)");
    expect(events[0].data).toEqual({ entryId: learned.id, toolName: "Carpenter's Tools" });
  });

  it("400s on learnToolProficiency for a non-artisan tool", async () => {
    const res = await post([{ type: "learnToolProficiency", name: "Thieves' Tools" }]);
    expect(res.status).toBe(400);
  });

  it("400s on duplicate learnToolProficiency", async () => {
    // Bump the tool choice cap isn't possible; duplicate must be caught before cap.
    // A single artisan tool is the cap (1), so re-learning the same one 400s.
    await post([{ type: "learnToolProficiency", name: "Smith's Tools" }]);
    const dup = await post([{ type: "learnToolProficiency", name: "Smith's Tools" }]);
    expect(dup.status).toBe(400);
  });

  it("400s on learnToolProficiency once the choice count (1) is reached", async () => {
    await post([{ type: "learnToolProficiency", name: "Smith's Tools" }]);
    const second = await post([{ type: "learnToolProficiency", name: "Carpenter's Tools" }]);
    expect(second.status).toBe(400);
  });

  // ── forgetToolProficiency ───────────────────────────────────────────────────

  it("forgetToolProficiency removes a tool proficiency by entry id", async () => {
    const learn = await post([{ type: "learnToolProficiency", name: "Smith's Tools" }]);
    const entryId = toolProfs(learn)[0].id;

    const res = await post([{ type: "forgetToolProficiency", entryId }]);
    expect(res.status).toBe(200);
    expect(toolProfs(res).find((t) => t.id === entryId)).toBeUndefined();

    const events = await activity();
    const forget = events.find((e) => e.type === "forgetToolProficiency")!;
    expect(forget.summary).toBe("Forgot tool proficiency: Smith's Tools");
    expect(forget.data).toEqual({ entryId, toolName: "Smith's Tools" });
  });

  it("400s on forgetToolProficiency for an unknown entry id", async () => {
    const res = await post([{ type: "forgetToolProficiency", entryId: "does-not-exist" }]);
    expect(res.status).toBe(400);
  });

  // ── Request-level guards ────────────────────────────────────────────────────

  it("404s for an unknown character", async () => {
    const res = await agent()
      .post("/api/characters/does-not-exist/resources/transactions")
      .send({ operations: [{ type: "spendResource", key: "superiorityDice" }] });
    expect(res.status).toBe(404);
  });

  it("400s on an empty operations array", async () => {
    const res = await post([]);
    expect(res.status).toBe(400);
  });

  // ── Cross-cutting invariants ────────────────────────────────────────────────

  it("is atomic: a later failing op rolls back an earlier valid spend and writes no events", async () => {
    const res = await post([
      { type: "spendResource", key: "superiorityDice" },
      { type: "forgetManeuver", entryId: "not-a-real-entry" },
    ]);
    expect(res.status).toBe(400);

    const char = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect(pool(char, "superiorityDice").used).toBe(0);
    expect(await activity()).toHaveLength(0);
  });

  it("re-reads state per op: a batch of 4 spends leaves 4 used, a 5th 400s", async () => {
    const batch = await post([
      { type: "spendResource", key: "superiorityDice" },
      { type: "spendResource", key: "superiorityDice" },
      { type: "spendResource", key: "superiorityDice" },
      { type: "spendResource", key: "superiorityDice" },
    ]);
    expect(batch.status).toBe(200);
    expect(pool(batch, "superiorityDice").used).toBe(4);

    const fifth = await post([{ type: "spendResource", key: "superiorityDice" }]);
    expect(fifth.status).toBe(400);
  });

  it("groups a multi-op success under a single batchId", async () => {
    const res = await post([
      { type: "spendResource", key: "superiorityDice" },
      { type: "spendResource", key: "superiorityDice" },
    ]);
    expect(res.status).toBe(200);

    const events = await activity();
    expect(events).toHaveLength(2);
    expect(events[0].batchId).toBeDefined();
    expect(events[0].batchId).toBe(events[1].batchId);
  });

  it("round-trips: learning a tool proficiency preserves a previously learned maneuver", async () => {
    await post([{ type: "learnManeuver", custom: { name: "Riposte", description: "d" } }]);
    await post([{ type: "learnToolProficiency", name: "Smith's Tools" }]);

    const char = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect(maneuvers(char).some((m) => m.name === "Riposte")).toBe(true);
    expect(toolProfs(char).some((t) => t.name === "Smith's Tools")).toBe(true);
  });

  // ── undo preserves a Fighting Style feat advancement (issue #319 / #1137) ────

  it("a resource op → undo preserves a previously taken Fighting Style feat", async () => {
    const fsFeat = {
      id: "adv-fs", level: 1, kind: "feat", slot: "fightingStyle",
      abilityDeltas: {}, hpDelta: 0, initDelta: 0,
      featName: "Defense", featDescription: "d", improvements: [{ target: "armorClassWhileArmored", amount: 1 }],
    };
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: { resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: [], advancements: [fsFeat] } as unknown as Prisma.InputJsonValue },
    });

    const spend = await post([{ type: "spendResource", key: "superiorityDice" }]);
    expect(spend.status).toBe(200);
    const hasFs = (advs: Array<{ slot?: string }>) => advs.some((a) => a.slot === "fightingStyle");
    expect(hasFs(spend.body.advancements)).toBe(true);

    const events = await activity();
    const ev = events.find((e) => e.type === "spendResource")!;
    expect(hasFs((ev.before!.resources as { advancements: Array<{ slot?: string }> }).advancements)).toBe(true);
    expect(hasFs((ev.after!.resources as { advancements: Array<{ slot?: string }> }).advancements)).toBe(true);

    const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${ev.batchId}/revert`);
    expect(undo.status).toBe(200);
    expect(hasFs(undo.body.advancements)).toBe(true);
    expect(pool(undo, "superiorityDice").used).toBe(0);
  });
});

// ── learnDiscipline / forgetDiscipline / swapDiscipline event payload pins ────
// The route-level discipline behavior (caps, level gates, swap-once-per-level)
// is already covered by disciplines.test.ts; this block pins the exact
// summary/eventData shape emitted by applyOp for the three discipline branches
// (the other six branches are pinned above), ahead of the applyOp decomposition.

describe("POST /api/characters/:id/resources/transactions — discipline event payloads", () => {
  const MONK_FIXTURE_ID = "test-resources-monk-1";
  const MONK_CATALOG_NAME = "Resources Route Test Monk";
  const DISC_CATALOG_NAME = "Resources Route Test Water Whip";
  const DISC_CUSTOM_NAME = "Homebrew Discipline";

  interface DisciplineEntry {
    id: string;
    name: string;
    disciplineId?: string;
  }

  let catalogDisciplineId: string;

  // Level 6 Way of the Four Elements monk. XP 14000 → level 6 → discipline cap 2.
  const MONK_FIXTURE_BASE = {
    id: MONK_FIXTURE_ID,
    name: "Resources Test Monk",
    alignment: "Lawful Neutral",
    experiencePoints: 14000,
    initiativeBonus: 2,
    speed: 30,
    hitPoints: { current: 20, max: 20, temp: 0 },
    hitDice: { total: 6, die: "d8" },
    abilityScores: {
      strength: 10,
      dexterity: 16,
      constitution: 12,
      intelligence: 10,
      wisdom: 15,
      charisma: 10,
    },
    savingThrowProficiencies: ["strength", "dexterity"],
    skills: [],
    toolProficiencies: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  };

  const monkUrl = `/api/characters/${MONK_FIXTURE_ID}/resources/transactions`;
  const monkActivityUrl = `/api/characters/${MONK_FIXTURE_ID}/activity?category=resources`;

  function monkAgent() {
    return supertest.agent(createApp()).set("Cookie", COOKIE);
  }
  async function monkPost(operations: unknown[]) {
    return monkAgent().post(monkUrl).send({ operations });
  }
  async function monkActivity(): Promise<ActivityEvent[]> {
    const res = await monkAgent().get(monkActivityUrl);
    return res.body as ActivityEvent[];
  }
  function disciplinesKnown(res: { body: { resources: { disciplinesKnown: DisciplineEntry[] } } }): DisciplineEntry[] {
    return res.body.resources.disciplinesKnown;
  }

  afterAll(async () => {
    await prisma.grantedAbility.deleteMany({ where: { name: DISC_CATALOG_NAME } });
    await prisma.characterClass.deleteMany({ where: { name: MONK_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);

    const cls = await prisma.characterClass.upsert({
      where: { name: MONK_CATALOG_NAME },
      create: {
        name: MONK_CATALOG_NAME,
        hitDie: "d8",
        savingThrows: ["strength", "dexterity"],
        skillChoiceCount: 2,
        skillChoices: ["acrobatics", "stealth"],
        isSpellcaster: false,
      },
      update: {},
    });

    const discipline = await prisma.grantedAbility.upsert({
      where: { name: DISC_CATALOG_NAME },
      create: {
        name: DISC_CATALOG_NAME,
        source: "discipline",
        description: "Test discipline description.",
        minLevel: 3,
      },
      update: {},
    });
    catalogDisciplineId = discipline.id;

    await prisma.character.create({
      data: {
        ...MONK_FIXTURE_BASE,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "monk", subclass: "way of the four elements", classId: cls.id, position: 0 }],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: MONK_FIXTURE_ID } });
  });

  it("learnDiscipline from catalog logs an exact summary + eventData", async () => {
    const res = await monkPost([{ type: "learnDiscipline", disciplineId: catalogDisciplineId }]);
    expect(res.status).toBe(200);
    const entry = disciplinesKnown(res)[0];

    const events = await monkActivity();
    expect(events[0].type).toBe("learnDiscipline");
    expect(events[0].summary).toBe(`Learned discipline: ${DISC_CATALOG_NAME}`);
    expect(events[0].data).toEqual({
      entryId: entry.id,
      disciplineName: DISC_CATALOG_NAME,
      disciplineId: catalogDisciplineId,
    });
  });

  it("learnDiscipline with a custom payload has a null disciplineId", async () => {
    const res = await monkPost([
      { type: "learnDiscipline", custom: { name: DISC_CUSTOM_NAME, description: "d" } },
    ]);
    expect(res.status).toBe(200);
    const entry = disciplinesKnown(res).find((d) => d.name === DISC_CUSTOM_NAME)!;

    const events = await monkActivity();
    expect(events[0].summary).toBe(`Learned discipline: ${DISC_CUSTOM_NAME}`);
    expect(events[0].data).toEqual({
      entryId: entry.id,
      disciplineName: DISC_CUSTOM_NAME,
      disciplineId: null,
    });
  });

  it("forgetDiscipline logs an exact summary + eventData", async () => {
    const learn = await monkPost([{ type: "learnDiscipline", disciplineId: catalogDisciplineId }]);
    const entryId = disciplinesKnown(learn)[0].id;

    const res = await monkPost([{ type: "forgetDiscipline", entryId }]);
    expect(res.status).toBe(200);

    const events = await monkActivity();
    const forget = events.find((e) => e.type === "forgetDiscipline")!;
    expect(forget.summary).toBe(`Forgot discipline: ${DISC_CATALOG_NAME}`);
    expect(forget.data).toEqual({ entryId, disciplineName: DISC_CATALOG_NAME });
  });

  it("swapDiscipline logs an exact summary + eventData", async () => {
    const learn = await monkPost([{ type: "learnDiscipline", disciplineId: catalogDisciplineId }]);
    const entryId = disciplinesKnown(learn)[0].id;

    const res = await monkPost([
      { type: "swapDiscipline", entryId, custom: { name: "Retrained Discipline", description: "d" } },
    ]);
    expect(res.status).toBe(200);
    const swapped = disciplinesKnown(res).find((d) => d.name === "Retrained Discipline")!;

    const events = await monkActivity();
    expect(events[0].type).toBe("swapDiscipline");
    expect(events[0].summary).toBe(`Swapped discipline: ${DISC_CATALOG_NAME} → Retrained Discipline`);
    expect(events[0].data).toEqual({
      entryId: swapped.id,
      replacedEntryId: entryId,
      fromName: DISC_CATALOG_NAME,
      toName: "Retrained Discipline",
      disciplineId: null,
    });
  });
});
