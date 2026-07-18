import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-level-up-tx";
let COOKIE: string;
const app = createApp();

const BASE = {
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function post(characterId: string, body: object) {
  return supertest(app)
    .post(`/api/characters/${characterId}/level-up/transactions`)
    .set("Cookie", COOKIE)
    .send(body);
}

// The distinct batchId a single level-up request must group all its events under.
async function distinctBatchIds(characterId: string): Promise<string[]> {
  const events = await prisma.characterEvent.findMany({ where: { characterId }, select: { batchId: true } });
  return [...new Set(events.map((e) => e.batchId).filter((b): b is string => Boolean(b)))];
}

async function eventCategories(characterId: string): Promise<string[]> {
  const events = await prisma.characterEvent.findMany({ where: { characterId }, select: { category: true } });
  return events.map((e) => e.category);
}

function eventCount(characterId: string): Promise<number> {
  return prisma.characterEvent.count({ where: { characterId } });
}

// The batchId of the most-recent non-revert event, via the public activity
// timeline (desc order) — mirrors activity.test.ts's latestBatchId helper.
async function latestBatchId(characterId: string): Promise<string> {
  const res = await supertest(app).get(`/api/characters/${characterId}/activity`).set("Cookie", COOKIE);
  expect(res.status).toBe(200);
  const events = res.body as Array<{ batchId?: string; type: string }>;
  const ev = events.find((e) => e.type !== "revert" && e.batchId);
  if (!ev?.batchId) throw new Error("no batchId found on the activity timeline");
  return ev.batchId;
}

function revert(characterId: string, batchId: string) {
  return supertest(app)
    .post(`/api/characters/${characterId}/events/${batchId}/revert`)
    .set("Cookie", COOKIE)
    .send();
}

// A distinct second owner for the foreign-access (403) case.
const OWNER_ID_2 = "owner-level-up-tx-2";
let COOKIE_2: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  await ensureTestOwner(OWNER_ID_2);
  COOKIE = await authCookie(OWNER_ID);
  COOKIE_2 = await authCookie(OWNER_ID_2);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "LevelUpTx" } } });
});
afterAll(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "LevelUpTx" } } });
});

describe("POST /api/characters/:id/level-up/transactions — Fighter 7→8 (hp + ASI)", () => {
  let fighterClassId: string;
  const CHAR_ID = "lvtx-fighter-8";

  beforeEach(async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    fighterClassId = fighter.id;
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Fighter",
        experiencePoints: 34000, // level 8 threshold
        hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 7, die: "d10", spent: 0 },
        abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "fighter", subclass: "Champion", classId: fighterClassId, position: 0, level: 7 }],
        },
      },
    });
  });

  it("applies hp + ASI under one batchId and returns the leveled character", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
    });

    expect(res.status).toBe(200);
    // Fighter d10 average = floor(10/2)+1 = 6; conMod +2 → +8 max HP. ASI bumps
    // strength (not con) so HP gain is the level-up gain alone.
    expect(res.body.hitDice.total).toBe(8);
    expect(res.body.hitPoints.max).toBe(68);
    expect(res.body.abilityScores.strength).toBe(16);

    const batchIds = await distinctBatchIds(CHAR_ID);
    expect(batchIds).toHaveLength(1);
    const categories = await eventCategories(CHAR_ID);
    expect(categories).toContain("hitPoints");
    expect(categories).toContain("advancement");
  });

  it("400s when a required advancement step is missing (route wires validation)", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      // No `advancement` — Fighter L8 grants an ASI, so validation must reject.
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/advancement|ability score/i);
  });
});

describe("POST /api/characters/:id/level-up/transactions — Battle Master ceremony (Fighter 2→3)", () => {
  const CHAR_ID = "lvtx-battlemaster-3";

  beforeEach(async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Battle Master",
        experiencePoints: 900, // level 3 threshold
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "fighter", subclass: null, classId: fighter.id, position: 0, level: 2 }],
        },
      },
    });
  });

  it("sets subclass + 3 maneuvers + tool proficiency under one batchId", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { name: "Battle Master" } });
    const maneuvers = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 3, select: { id: true } });
    expect(maneuvers).toHaveLength(3);

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      subclassId: battleMaster.id,
      maneuvers: maneuvers.map((m) => ({ type: "learnManeuver", maneuverId: m.id })),
      toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }],
    });

    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(3);
    expect(res.body.classes[0].subclass).toBe("Battle Master");
    expect(res.body.resources.maneuversKnown).toHaveLength(3);
    expect(res.body.resources.toolProficienciesKnown.map((t: { name: string }) => t.name)).toContain("Smith's Tools");

    const batchIds = await distinctBatchIds(CHAR_ID);
    expect(batchIds).toHaveLength(1);
    const categories = await eventCategories(CHAR_ID);
    expect(categories).toContain("hitPoints");
    expect(categories).toContain("class");
    expect(categories).toContain("resources");

    // The subclass drifted onto the persisted primary entry (not just the response).
    const persisted = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(persisted.subclass).toBe("Battle Master");
  });
});

describe("POST /api/characters/:id/level-up/transactions — Wizard 3→4 (hp + ASI + spells)", () => {
  const CHAR_ID = "lvtx-wizard-4";

  beforeEach(async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Wizard",
        experiencePoints: 2700, // level 4 threshold
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d6", spent: 0 },
        abilityScores: { strength: 8, dexterity: 14, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: {
          create: [{ name: "wizard", subclass: "School of Evocation", classId: wizard.id, position: 0, level: 3 }],
        },
      },
    });
  });

  it("learns 2 spells alongside hp + ASI under one batchId", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const spells = await prisma.spell.findMany({ where: { classes: { has: "wizard" } }, take: 2, select: { id: true, name: true } });
    expect(spells).toHaveLength(2);

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      // Wizard gains an ASI at level 4; bump INT (not CON) so HP isn't perturbed.
      advancement: { type: "takeAsi", increases: [{ ability: "intelligence", amount: 2 }] },
      spellsLearned: spells.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });

    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(4);
    const bookNames = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    for (const spell of spells) expect(bookNames).toContain(spell.name);

    const batchIds = await distinctBatchIds(CHAR_ID);
    expect(batchIds).toHaveLength(1);
    const categories = await eventCategories(CHAR_ID);
    expect(categories).toContain("hitPoints");
    expect(categories).toContain("advancement");
    expect(categories).toContain("spellcasting");
  });

  // The issue's undo AC names "HP, ability delta, hit die, spells" — the caster
  // ceremony covers the two domains the Battle Master undo test can't.
  it("single revert restores hp, ability delta, hit die, and unlearns the spells", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const spells = await prisma.spell.findMany({ where: { classes: { has: "wizard" } }, take: 2, select: { id: true } });

    const ceremony = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "intelligence", amount: 2 }] },
      spellsLearned: spells.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });
    expect(ceremony.status).toBe(200);
    expect(ceremony.body.abilityScores.intelligence).toBe(18);

    const res = await revert(CHAR_ID, await latestBatchId(CHAR_ID));
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.max).toBe(18);
    expect(res.body.hitPoints.current).toBe(18);
    expect(res.body.hitDice.total).toBe(3);
    expect(res.body.abilityScores.intelligence).toBe(16);
    expect(res.body.spellcasting.spells).toHaveLength(0);
    expect(res.body.pendingLevelUps).toBe(1);
  });
});

// HP applies first in-tx, so a failure in the last (spell) op proves the whole
// ceremony rolls back — the core #885 acceptance criterion.
describe("POST …/level-up/transactions — atomicity (mid-apply failure rolls back everything)", () => {
  const CHAR_ID = "lvtx-atomicity-wizard";

  beforeEach(async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Atomicity Wizard",
        experiencePoints: 2700, // level 4 threshold
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d6", spent: 0 },
        abilityScores: { strength: 8, dexterity: 14, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: {
          create: [{ name: "wizard", subclass: "School of Evocation", classId: wizard.id, position: 0, level: 3 }],
        },
      },
    });
  });

  it("rolls back hp + ASI + the first (valid) spell when the LAST spell id is bogus", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const [realSpell] = await prisma.spell.findMany({ where: { classes: { has: "wizard" } }, take: 1, select: { id: true, name: true } });
    expect(realSpell).toBeDefined();

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "intelligence", amount: 2 }] },
      // Count is 2 (passes zod + validator); the FIRST is real, the LAST is a
      // well-formed but nonexistent id that fails inside the spellcasting seam
      // AFTER hp/ASI/first-spell have already written — the whole tx must roll back.
      spellsLearned: [
        { type: "learnSpell", spellId: realSpell.id },
        { type: "learnSpell", spellId: "bogus-but-well-formed-spell-id" },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/spell not found in catalog/i);

    // Nothing persisted: re-read the raw row and assert every touched domain is
    // exactly as seeded, and NO events were written.
    const after = await prisma.character.findUniqueOrThrow({ where: { id: CHAR_ID } });
    expect(after.hitPoints).toMatchObject({ max: 18, current: 18 });
    expect(after.hitDice).toMatchObject({ total: 3 });
    expect(after.abilityScores).toMatchObject({ intelligence: 16 });
    const book = (after.spellcasting as { spells: Array<{ id: string }> }).spells;
    expect(book).toHaveLength(0); // the valid first spell must NOT be present
    expect(await eventCount(CHAR_ID)).toBe(0);
  });
});

// The ceremony shares one batchId, so a single revertBatch must reverse every
// domain it touched — the other core #885 acceptance criterion.
describe("POST …/level-up/transactions — whole-ceremony single undo (revertBatch)", () => {
  const CHAR_ID = "lvtx-undo-battlemaster";

  beforeEach(async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Undo Battle Master",
        experiencePoints: 900, // level 3 threshold; hitDice.total 2 → 1 pending
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "fighter", subclass: null, classId: fighter.id, position: 0, level: 2 }],
        },
      },
    });
  });

  it("reverts hp + subclass + maneuvers + tool proficiency, restoring the pending level-up", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { name: "Battle Master" } });
    const maneuvers = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 3, select: { id: true } });
    expect(maneuvers).toHaveLength(3);

    const ceremony = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      subclassId: battleMaster.id,
      maneuvers: maneuvers.map((m) => ({ type: "learnManeuver", maneuverId: m.id })),
      toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }],
    });
    expect(ceremony.status).toBe(200);
    expect(ceremony.body.hitDice.total).toBe(3);
    expect(ceremony.body.pendingLevelUps).toBe(0);

    // The whole ceremony is one batch — a single revert undoes all of it.
    expect(await distinctBatchIds(CHAR_ID)).toHaveLength(1);
    const batchId = await latestBatchId(CHAR_ID);
    const res = await revert(CHAR_ID, batchId);
    expect(res.status).toBe(200);

    // Full reversal across every domain the ceremony touched.
    expect(res.body.hitDice.total).toBe(2); // hit die reverted
    expect(res.body.hitPoints.max).toBe(18);
    expect(res.body.hitPoints.current).toBe(18);
    expect(res.body.classes[0].subclass ?? null).toBeNull(); // subclass back to null
    expect(res.body.resources.maneuversKnown).toHaveLength(0); // maneuvers gone
    expect(res.body.resources.toolProficienciesKnown.map((t: { name: string }) => t.name)).not.toContain("Smith's Tools");
    // XP was untouched but hitDice reverted, so the level-up is pending again.
    expect(res.body.pendingLevelUps).toBe(1);

    // The persisted primary entry's subclass is cleared too (not just the response).
    const persisted = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(persisted.subclass ?? null).toBeNull();
  });
});

describe("POST …/level-up/transactions — rejection matrix", () => {
  const fighterClass = () => prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });

  // Fighter fixture with explicit XP / hit-dice / entry level / subclass.
  async function makeFighter(opts: {
    id: string;
    name: string;
    xp: number;
    hitDiceTotal: number;
    entryLevel: number;
    subclass: string | null;
  }): Promise<string> {
    const fighter = await fighterClass();
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: opts.id,
        name: opts.name,
        experiencePoints: opts.xp,
        hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: opts.hitDiceTotal, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "fighter", subclass: opts.subclass, classId: fighter.id, position: 0, level: opts.entryLevel }],
        },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: opts.id } });
    return entry.id;
  }


  it("zod 400: missing hp entirely → Invalid request body", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-nohp", name: "LevelUpTx Rej NoHp", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const res = await post("lvtx-rej-nohp", {
      target: { kind: "existing", classEntryId: entryId },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid request body/i);
  });

  it("zod 400: malformed advancement op (bad type) → Invalid request body", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-badadv", name: "LevelUpTx Rej BadAdv", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const res = await post("lvtx-rej-badadv", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      advancement: { type: "takeNothing", increases: [] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid request body/i);
  });


  it("validator 400: excess spellsLearned for a Fighter → does not grant new spells", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-excessspell", name: "LevelUpTx Rej ExcessSpell", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const res = await post("lvtx-rej-excessspell", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      spellsLearned: [{ type: "learnSpell", spellId: "any-spell-id" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not grant new spells/i);
  });

  it("validator 400: wrong maneuver count for a Battle Master ceremony → expected 3", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-maneuvers", name: "LevelUpTx Rej Maneuvers", xp: 900, hitDiceTotal: 2, entryLevel: 2, subclass: null });
    const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { name: "Battle Master" } });
    const maneuvers = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 2, select: { id: true } });
    const res = await post("lvtx-rej-maneuvers", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      subclassId: battleMaster.id,
      maneuvers: maneuvers.map((m) => ({ type: "learnManeuver", maneuverId: m.id })), // only 2
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expected 3/i);
  });

  it("validator 400: subclassId when the target already has a subclass → does not include a subclass choice", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-hassub", name: "LevelUpTx Rej HasSub", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { name: "Battle Master" } });
    const res = await post("lvtx-rej-hassub", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      subclassId: battleMaster.id, // real id → resolves, but the level grants no subclass choice
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not include a subclass choice/i);
  });

  it("validator 400: missing subclassId on a Fighter 2→3 → requires choosing a subclass", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-nosub", name: "LevelUpTx Rej NoSub", xp: 900, hitDiceTotal: 2, entryLevel: 2, subclass: null });
    const res = await post("lvtx-rej-nosub", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/requires choosing a subclass/i);
  });

  it("validator 400: unknown (well-formed but nonexistent) subclassId → Subclass not found", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-unknownsub", name: "LevelUpTx Rej UnknownSub", xp: 900, hitDiceTotal: 2, entryLevel: 2, subclass: null });
    const res = await post("lvtx-rej-unknownsub", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
      subclassId: "nonexistent-subclass-id",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subclass not found/i);
  });


  it("in-tx 400: valid-shaped submission but no pending level-up → the hp seam throws", async () => {
    // XP 2700 derives level 4; hitDice.total already 4 → newLevel 5 validates
    // (level-5 Fighter grants only hit points), but the hp seam sees no pending
    // level and throws inside the tx.
    const entryId = await makeFighter({ id: "lvtx-rej-nopending", name: "LevelUpTx Rej NoPending", xp: 2700, hitDiceTotal: 4, entryLevel: 4, subclass: "Champion" });
    const res = await post("lvtx-rej-nopending", {
      target: { kind: "existing", classEntryId: entryId },
      hp: { method: "average" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no pending level-up/i);
  });


  it("400: a subclass choice on a NON-primary multiclass entry is not supported", async () => {
    const CHAR_ID = "lvtx-rej-multiclass";
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await fighterClass();
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Rej Multiclass",
        experiencePoints: 2700, // total level 4; multiclass path uses entry.level+1
        hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d8", spent: 0 }, // < derived → a pending level exists
        abilityScores: { strength: 14, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: {
          create: [
            { name: "wizard", subclass: "School of Evocation", classId: wizard.id, position: 0, level: 2 },
            { name: "fighter", subclass: null, classId: fighter.id, position: 1, level: 2 },
          ],
        },
      },
    });
    // Target the SECOND (non-primary) entry at its subclass level (fighter 2→3).
    const secondary = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 1 } });
    const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { name: "Battle Master" } });
    const maneuvers = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 3, select: { id: true } });

    // A COMPLETE, valid Battle Master ceremony so submission validation passes —
    // the rejection then comes from the post-validation non-primary guard, not a
    // count mismatch.
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: secondary.id },
      hp: { method: "average" },
      subclassId: battleMaster.id,
      maneuvers: maneuvers.map((m) => ({ type: "learnManeuver", maneuverId: m.id })),
      toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-primary class/i);
  });

  // Status-only asserts, matching the authorization.test.ts access-guard convention.

  it("404: nonexistent characterId", async () => {
    const res = await post("lvtx-does-not-exist", {
      target: { kind: "existing", classEntryId: "whatever" },
      hp: { method: "average" },
    });
    expect(res.status).toBe(404);
  });

  it("403: a character owned by someone else", async () => {
    const entryId = await makeFighter({ id: "lvtx-rej-foreign", name: "LevelUpTx Rej Foreign", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const res = await supertest(app)
      .post(`/api/characters/lvtx-rej-foreign/level-up/transactions`)
      .set("Cookie", COOKIE_2) // a different owner
      .send({
        target: { kind: "existing", classEntryId: entryId },
        hp: { method: "average" },
        advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      });
    expect(res.status).toBe(403);
  });
});

// Hunter's Prey (Ranger → Hunter, L3) is the seeded generic subclass choice that
// makes the known-key count check reachable without fixture gymnastics.
describe("POST …/level-up/transactions — subclassChoice validator messages", () => {
  it("rejects a subclassChoices entry with a bogus choiceKey on a ceremony with no such step", async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: "lvtx-choice-bogus",
        name: "LevelUpTx Choice Bogus",
        experiencePoints: 34000, // Fighter 7→8: hp + ASI only, no subclassChoice step
        hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 7, die: "d10", spent: 0 },
        abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", subclass: "Champion", classId: fighter.id, position: 0, level: 7 }] },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: "lvtx-choice-bogus" } });

    const res = await post("lvtx-choice-bogus", {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      subclassChoices: [{ type: "learnSubclassChoice", choiceKey: "bogusKey", optionId: "x" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not include a "bogusKey" choice/i);
  });

  it("enforces the count of a KNOWN generic subclass choice (Ranger→Hunter, Hunter's Prey at L3)", async () => {
    const ranger = await prisma.characterClass.findFirstOrThrow({ where: { name: "Ranger" } });
    const hunter = await prisma.subclass.findFirstOrThrow({ where: { name: "Hunter", classId: ranger.id } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: "lvtx-choice-hunter",
        name: "LevelUpTx Choice Hunter",
        experiencePoints: 900, // level 3 threshold; hitDice.total 2 → 1 pending
        hitPoints: { current: 22, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d10", spent: 0 },
        abilityScores: { strength: 12, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 14, charisma: 8 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "ranger", subclass: null, classId: ranger.id, position: 0, level: 2 }] },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: "lvtx-choice-hunter" } });

    // Hunter's Prey grants exactly ONE choice at L3; submit TWO → count mismatch.
    // (subclassChoice precedes newSpells in plan order, so this throws first —
    // the ranger's L3 spell step is never reached.)
    const res = await post("lvtx-choice-hunter", {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      subclassId: hunter.id,
      subclassChoices: [
        { type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: "a" },
        { type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: "b" },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expected 1 huntersPrey choices for this level-up, got 2/i);
  });
});
