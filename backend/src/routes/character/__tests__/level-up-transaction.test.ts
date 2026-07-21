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

  it("learns 2 spells + 1 cantrip alongside hp + ASI under one batchId", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const spells = await prisma.spell.findMany({ where: { classes: { has: "wizard" }, level: { gt: 0 } }, take: 2, select: { id: true, name: true } });
    expect(spells).toHaveLength(2);
    // #1131: wizard gains its 4th cantrip at level 4, so the newSpells step now
    // demands exactly one cantrip pick alongside the two scribed spells.
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classes: { has: "wizard" }, level: 0 }, select: { id: true, name: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      // Wizard gains an ASI at level 4; bump INT (not CON) so HP isn't perturbed.
      advancement: { type: "takeAsi", increases: [{ ability: "intelligence", amount: 2 }] },
      spellsLearned: spells.map((s) => ({ type: "learnSpell", spellId: s.id })),
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
    });

    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(4);
    const bookNames = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    for (const spell of spells) expect(bookNames).toContain(spell.name);
    expect(bookNames).toContain(cantrip.name);

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
    const spells = await prisma.spell.findMany({ where: { classes: { has: "wizard" }, level: { gt: 0 } }, take: 2, select: { id: true } });
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classes: { has: "wizard" }, level: 0 }, select: { id: true } });

    const ceremony = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "intelligence", amount: 2 }] },
      spellsLearned: spells.map((s) => ({ type: "learnSpell", spellId: s.id })),
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
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

// Prepared-spell swap (#1101/#1127): a Sorcerer (onLevelUp cadence) may forget one
// prepared spell and learn an extra one in the same level-up. Forget applies BEFORE
// learn. Sorcerer 5→6 is a clean count-1 level (prepared 9 → 10; no ASI/subclass step).
describe("POST …/level-up/transactions — prepared-spell swap (Sorcerer 5→6, #1101)", () => {
  const CHAR_ID = "lvtx-sorcerer-swap";
  let seeded: Array<{ id: string; name: string }>; // catalog spells seeded as known
  let fresh: Array<{ id: string; name: string }>;   // catalog spells to learn new

  // Minimal known-spell entry snapshot; only id/spellId/level/source matter for
  // the swap, but the serializer reads the descriptive fields too.
  function entryFor(spell: { id: string; name: string; level: number; school: string; castingTime: string; range: string; duration: string; description: string }, entryId: string) {
    return {
      id: entryId,
      spellId: spell.id,
      name: spell.name,
      level: spell.level,
      school: spell.school,
      prepared: false,
      castingTime: spell.castingTime,
      range: spell.range,
      duration: spell.duration,
      description: spell.description,
    };
  }

  beforeEach(async () => {
    const sorcerer = await prisma.characterClass.findFirstOrThrow({ where: { name: "Sorcerer" } });
    const pool = await prisma.spell.findMany({ where: { classes: { has: "sorcerer" }, level: 1 }, take: 5 });
    expect(pool.length).toBe(5);
    seeded = [pool[0], pool[1]];
    fresh = [pool[2], pool[3], pool[4]];
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Sorcerer Swap",
        experiencePoints: 14000, // level 6 threshold; hitDice.total 5 → 1 pending
        hitPoints: { current: 22, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 5, die: "d6", spent: 0 },
        abilityScores: { strength: 8, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 16 },
        spellcasting: {
          slotsUsed: {}, arcanumUsed: {}, concentratingOn: null,
          spells: [entryFor(pool[0], "known-a"), entryFor(pool[1], "known-b")],
        },
        classEntries: { create: [{ name: "sorcerer", subclass: "Draconic Bloodline", classId: sorcerer.id, position: 0, level: 5 }] },
      },
    });
  });

  it("forgets one known spell and learns two new ones under one batchId", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      spellsForgotten: [{ type: "forgetSpell", entryId: "known-a" }],
      spellsLearned: fresh.slice(0, 2).map((s) => ({ type: "learnSpell", spellId: s.id })),
    });

    expect(res.status).toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).not.toContain(seeded[0].name); // forgotten
    expect(names).toContain(seeded[1].name);     // kept
    for (const s of fresh.slice(0, 2)) expect(names).toContain(s.name); // learned
    expect(await distinctBatchIds(CHAR_ID)).toHaveLength(1);
  });

  it("swap-to-same-spellId works ONLY because forget applies before learn", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    // Re-learn the very spellId being forgotten (known-a → seeded[0].id), plus one
    // genuinely new spell. A learn-first order would 409 on the duplicate spellId.
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      spellsForgotten: [{ type: "forgetSpell", entryId: "known-a" }],
      spellsLearned: [
        { type: "learnSpell", spellId: seeded[0].id },
        { type: "learnSpell", spellId: fresh[0].id },
      ],
    });
    expect(res.status).toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).toContain(seeded[0].name);
    expect(names).toContain(fresh[0].name);
  });

  it("a single revert restores the forgotten spell and removes the learned ones", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const ceremony = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      spellsForgotten: [{ type: "forgetSpell", entryId: "known-a" }],
      spellsLearned: fresh.slice(0, 2).map((s) => ({ type: "learnSpell", spellId: s.id })),
    });
    expect(ceremony.status).toBe(200);

    const res = await revert(CHAR_ID, await latestBatchId(CHAR_ID));
    expect(res.status).toBe(200);
    const names = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(names).toContain(seeded[0].name); // restored
    for (const s of fresh.slice(0, 2)) expect(names).not.toContain(s.name); // learns undone
    expect(res.body.pendingLevelUps).toBe(1);
  });

  it("400: two forgets are rejected", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      // Net stays at the step count (1): 2 forgets offset by 3 learns, so
      // assertCounts passes and the ≤1-forget guard is what rejects.
      spellsForgotten: [
        { type: "forgetSpell", entryId: "known-a" },
        { type: "forgetSpell", entryId: "known-b" },
      ],
      spellsLearned: fresh.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most one/i);
  });

  it("400: malformed forget op (missing entryId) → Invalid request body", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      spellsForgotten: [{ type: "forgetSpell" }],
      spellsLearned: fresh.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid request body/i);
  });
});

// A Fighter has no newSpells step, so any forget is rejected up front (#1101).
describe("POST …/level-up/transactions — swap rejected for a non-caster (#1101)", () => {
  it("400: a Fighter 7→8 forget is rejected (does not allow swapping)", async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: "lvtx-fighter-swap",
        name: "LevelUpTx Fighter Swap",
        experiencePoints: 34000,
        hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 7, die: "d10", spent: 0 },
        abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", subclass: "Champion", classId: fighter.id, position: 0, level: 7 }] },
      },
    });
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: "lvtx-fighter-swap" } });
    const res = await post("lvtx-fighter-swap", {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
      spellsForgotten: [{ type: "forgetSpell", entryId: "whatever" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not allow swapping/i);
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
    const [realSpell] = await prisma.spell.findMany({ where: { classes: { has: "wizard" }, level: { gt: 0 } }, take: 1, select: { id: true, name: true } });
    expect(realSpell).toBeDefined();
    // #1131: wizard L4 also demands one cantrip; a valid one keeps the failure in
    // the LAST leveled spell so the atomicity assertion still exercises the rollback.
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classes: { has: "wizard" }, level: 0 }, select: { id: true } });

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
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
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


  it("a subclass choice on a NON-primary multiclass entry commits — subclass + maneuvers + tool land on the secondary entry (#1177)", async () => {
    const CHAR_ID = "lvtx-rej-multiclass";
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await fighterClass();
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Rej Multiclass",
        experiencePoints: 6500, // total level 5; multiclass path uses entry.level+1 (2→3, entries sum 4→5)
        hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 4, die: "d8", spent: 0 }, // < derived → a pending level exists
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

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: secondary.id },
      hp: { method: "average" },
      subclassId: battleMaster.id,
      maneuvers: maneuvers.map((m) => ({ type: "learnManeuver", maneuverId: m.id })),
      toolProficiencies: [{ type: "learnToolProficiency", name: "Smith's Tools" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.classes[1]).toMatchObject({ name: "fighter", level: 3, subclass: "Battle Master" });
    expect(res.body.resources.maneuverChoiceCount).toBe(3); // fighter-3 Battle Master cap
    expect(res.body.resources.maneuversKnown).toHaveLength(3);
    expect(res.body.resources.toolProficienciesKnown.map((t: { name: string }) => t.name)).toContain("Smith's Tools");

    const batchIds = await distinctBatchIds(CHAR_ID);
    expect(batchIds).toHaveLength(1);

    const persisted = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: secondary.id } });
    expect(persisted.subclass).toBe("Battle Master");
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

// Non-primary ceremonies (#1065): multiclass-into-Fighter is the canonical case —
// its plan is [hitPoints, fightingStyleFeat, review], so without generalized class
// appliers no valid submission exists at all.
describe("POST …/level-up/transactions — multiclass ceremonies (#1065)", () => {
  const WIZARD_FIXTURE = {
    ...BASE,
    ownerId: OWNER_ID,
    // STR 14 satisfies the Fighter multiclass prerequisite (STR 13 or DEX 13).
    abilityScores: { strength: 14, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
    spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
  };

  it("multiclass INTO Fighter applies hp + fighting-style feat under one batchId, and it survives serialization", async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const defense = await prisma.feat.findFirstOrThrow({ where: { name: "Defense", category: "fighting_style" } });
    const CHAR_ID = "lvtx-mc-into-fighter";
    await prisma.character.create({
      data: {
        ...WIZARD_FIXTURE,
        id: CHAR_ID,
        name: "LevelUpTx MC Into Fighter",
        experiencePoints: 2700, // level 4 threshold; hitDice.total 3 → 1 pending
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d6", spent: 0 },
        classEntries: {
          create: [{ name: "wizard", subclass: "School of Evocation", classId: wizard.id, position: 0, level: 3 }],
        },
      },
    });

    const res = await post(CHAR_ID, {
      target: { kind: "new", classId: fighter.id },
      hp: { method: "average" },
      fightingStyleFeat: { type: "takeFeat", featId: defense.id },
    });

    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(4);
    // The new level-1 Fighter entry exists and the fs feat is VISIBLE on the wire
    // — the read-side clamp keeps it since the Fighter entry entitles a fs slot.
    expect(res.body.classes).toHaveLength(2);
    // The created entry snapshots the catalog's display name ("Fighter").
    expect(res.body.classes[1]).toMatchObject({ name: "Fighter", level: 1 });
    const fsAdv = res.body.advancements.find((a: { slot?: string }) => a.slot === "fightingStyle");
    expect(fsAdv?.featName).toBe("Defense");
    expect(res.body.fightingStyleSlots).toMatchObject({ total: 1, used: 1 });

    const batchIds = await distinctBatchIds(CHAR_ID);
    expect(batchIds).toHaveLength(1);

    // Persisted, not just serialized.
    const after = await prisma.character.findUniqueOrThrow({ where: { id: CHAR_ID } });
    expect((after.resources as { advancements: { slot?: string }[] }).advancements.some((a) => a.slot === "fightingStyle")).toBe(true);
  });

  it("single revert undoes the whole multiclass ceremony: entry gone, fs feat cleared", async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const defense = await prisma.feat.findFirstOrThrow({ where: { name: "Defense", category: "fighting_style" } });
    const CHAR_ID = "lvtx-mc-undo";
    await prisma.character.create({
      data: {
        ...WIZARD_FIXTURE,
        id: CHAR_ID,
        name: "LevelUpTx MC Undo",
        experiencePoints: 2700,
        hitPoints: { current: 18, max: 18, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d6", spent: 0 },
        classEntries: {
          create: [{ name: "wizard", subclass: "School of Evocation", classId: wizard.id, position: 0, level: 3 }],
        },
      },
    });

    const ceremony = await post(CHAR_ID, {
      target: { kind: "new", classId: fighter.id },
      hp: { method: "average" },
      fightingStyleFeat: { type: "takeFeat", featId: defense.id },
    });
    expect(ceremony.status).toBe(200);

    const res = await revert(CHAR_ID, await latestBatchId(CHAR_ID));
    expect(res.status).toBe(200);
    expect(res.body.classes).toHaveLength(1);
    expect(res.body.hitDice.total).toBe(3);
    expect(res.body.advancements.some((a: { slot?: string }) => a.slot === "fightingStyle")).toBe(false);
    expect(res.body.pendingLevelUps).toBe(1);
  });

  it("an EXISTING non-primary Fighter 2→3 can choose a subclass with no resource choices (Champion)", async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const champion = await prisma.subclass.findFirstOrThrow({ where: { name: "Champion", classId: fighter.id } });
    const CHAR_ID = "lvtx-mc-champion";
    await prisma.character.create({
      data: {
        ...WIZARD_FIXTURE,
        id: CHAR_ID,
        name: "LevelUpTx MC Champion",
        experiencePoints: 14000, // level 6 threshold; entries sum 5 → 1 pending
        hitPoints: { current: 34, max: 34, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 5, die: "d6", spent: 0 },
        classEntries: {
          create: [
            { name: "wizard", subclass: "School of Evocation", classId: wizard.id, position: 0, level: 3 },
            { name: "fighter", subclass: null, classId: fighter.id, position: 1, level: 2 },
          ],
        },
      },
    });
    const secondary = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 1 } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: secondary.id },
      hp: { method: "average" },
      subclassId: champion.id,
    });

    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(6);
    expect(res.body.classes[1].subclass).toBe("Champion");

    // The subclass landed on the SECONDARY entry, not the primary.
    const persisted = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: secondary.id } });
    expect(persisted.subclass).toBe("Champion");
    const primary = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 0 } });
    expect(primary.subclass).toBe("School of Evocation");
  });

  // An ALREADY-subclassed non-primary entry: Battle Master Fighter 6→7 grants
  // only maneuvers (no subclass step) — the entry-scoped cap must come from
  // the fighter entry's own level 7, not the wizard primary (#1177).
  it("a non-primary Battle Master 6→7 (maneuvers-only plan) commits and caps at the fighter-7 count; single revert restores everything", async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const CHAR_ID = "lvtx-mc-bm-maneuvers";
    await prisma.character.create({
      data: {
        ...WIZARD_FIXTURE,
        id: CHAR_ID,
        name: "LevelUpTx MC BM Maneuvers",
        experiencePoints: 64000, // level 10 threshold; entries sum 9 → 1 pending
        hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 9, die: "d6", spent: 0 },
        classEntries: {
          create: [
            { name: "wizard", subclass: "School of Evocation", classId: wizard.id, position: 0, level: 3 },
            { name: "fighter", subclass: "Battle Master", classId: fighter.id, position: 1, level: 6 },
          ],
        },
      },
    });
    const secondary = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 1 } });
    // Fighter 6→7 grants a delta of 2 new maneuver picks (5 at L7 minus 3 at L6).
    const maneuvers = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 2, select: { id: true } });
    expect(maneuvers).toHaveLength(2);

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: secondary.id },
      hp: { method: "average" },
      maneuvers: maneuvers.map((m) => ({ type: "learnManeuver", maneuverId: m.id })),
    });
    expect(res.status).toBe(200);
    expect(res.body.classes[1]).toMatchObject({ name: "fighter", level: 7 });
    expect(res.body.resources.maneuverChoiceCount).toBe(5); // fighter-7 Battle Master cap
    expect(res.body.resources.maneuversKnown).toHaveLength(2); // the ceremony's own delta

    const batchIds = await distinctBatchIds(CHAR_ID);
    expect(batchIds).toHaveLength(1);

    const undo = await revert(CHAR_ID, await latestBatchId(CHAR_ID));
    expect(undo.status).toBe(200);
    expect(undo.body.classes[1].level).toBe(6);
    expect(undo.body.resources.maneuversKnown).toHaveLength(0);
    expect(undo.body.pendingLevelUps).toBe(1);
  });

  it("a monk-secondary Way of the Four Elements ceremony (monk 2→3) records the discipline at the monk entry's own level (3), not total level", async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const monk = await prisma.characterClass.findFirstOrThrow({ where: { name: "Monk" } });
    const fourElements = await prisma.subclass.findFirstOrThrow({ where: { name: "Way of the Four Elements" } });
    const CHAR_ID = "lvtx-mc-monk-disciplines";
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx MC Monk Disciplines",
        experiencePoints: 34000, // level 8 threshold; entries sum 7 (fighter 5 + monk 2) → 1 pending
        hitPoints: { current: 50, max: 50, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 7, die: "d8", spent: 0 },
        abilityScores: { strength: 14, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 15, charisma: 10 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [
            { name: "fighter", subclass: "Champion", classId: fighter.id, position: 0, level: 5 },
            { name: "monk", subclass: null, classId: monk.id, position: 1, level: 2 },
          ],
        },
      },
    });
    const secondary = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 1 } });

    const plan = await supertest(app)
      .get(`/api/characters/${CHAR_ID}/level-up/plan`)
      .query({ classEntryId: secondary.id, subclassId: fourElements.id })
      .set("Cookie", COOKIE);
    expect(plan.status).toBe(200);
    const disciplineStep = (plan.body.steps as Array<{ kind: string; count?: number }>).find((s) => s.kind === "disciplines");
    expect(disciplineStep?.count).toBe(1); // Four Elements grants 1 discipline at monk L3

    const discipline = await prisma.grantedAbility.findFirstOrThrow({
      where: { source: "discipline", alwaysKnown: false, minLevel: { lte: 3 } },
      select: { id: true },
    });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: secondary.id },
      hp: { method: "average" },
      subclassId: fourElements.id,
      disciplines: [{ type: "learnDiscipline", disciplineId: discipline.id }],
    });
    expect(res.status).toBe(200);
    expect(res.body.classes[1]).toMatchObject({ name: "monk", level: 3, subclass: "Way of the Four Elements" });
    const known = res.body.resources.disciplinesKnown as Array<{ disciplineId?: string; learnedAtLevel: number }>;
    const entry = known.find((d) => d.disciplineId === discipline.id);
    expect(entry?.learnedAtLevel).toBe(3);
  });

  it("atomicity: a bogus maneuverId 400s the whole ceremony — entry level unchanged, zero events", async () => {
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const CHAR_ID = "lvtx-mc-bm-atomicity";
    await prisma.character.create({
      data: {
        ...WIZARD_FIXTURE,
        id: CHAR_ID,
        name: "LevelUpTx MC BM Atomicity",
        experiencePoints: 64000, // level 10 threshold; entries sum 9 → 1 pending
        hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 9, die: "d6", spent: 0 },
        classEntries: {
          create: [
            { name: "wizard", subclass: "School of Evocation", classId: wizard.id, position: 0, level: 3 },
            { name: "fighter", subclass: "Battle Master", classId: fighter.id, position: 1, level: 6 },
          ],
        },
      },
    });
    const secondary = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID, position: 1 } });
    const [real] = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 1, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: secondary.id },
      hp: { method: "average" },
      maneuvers: [
        { type: "learnManeuver", maneuverId: real.id },
        { type: "learnManeuver", maneuverId: "not-a-real-maneuver-id" },
      ],
    });
    expect(res.status).toBe(400);

    const persisted = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: secondary.id } });
    expect(persisted.level).toBe(6);
    expect(await eventCount(CHAR_ID)).toBe(0);
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
    // (2024: the Ranger re-prepares on a rest, so there is no newSpells step here.)
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

// #1131: cantrip progression through the ceremony. Warlock gains its 3rd cantrip
// and a prepared spell at level 4 (plus an ASI), so the newSpells step now carries
// a cantrip pick alongside the leveled pick.
describe("POST …/level-up/transactions — Warlock 3→4 cantrip + spell (#1131)", () => {
  const CHAR_ID = "lvtx-warlock-4";

  beforeEach(async () => {
    const warlock = await prisma.characterClass.findFirstOrThrow({ where: { name: "Warlock" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Warlock",
        experiencePoints: 2700, // level 4 threshold; hitDice.total 3 → 1 pending
        hitPoints: { current: 22, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d8", spent: 0 },
        abilityScores: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 16 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: { create: [{ name: "warlock", subclass: "The Fiend", classId: warlock.id, position: 0, level: 3 }] },
      },
    });
  });

  it("commits one new cantrip and one new spell together with hp + ASI", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const spell = await prisma.spell.findFirstOrThrow({ where: { classes: { has: "warlock" }, level: 1 }, select: { id: true, name: true } });
    const cantrip = await prisma.spell.findFirstOrThrow({ where: { classes: { has: "warlock" }, level: 0 }, select: { id: true, name: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "charisma", amount: 2 }] },
      spellsLearned: [{ type: "learnSpell", spellId: spell.id }],
      cantripsLearned: [{ type: "learnSpell", spellId: cantrip.id }],
    });

    expect(res.status).toBe(200);
    expect(res.body.hitDice.total).toBe(4);
    const bookNames = res.body.spellcasting.spells.map((s: { name: string }) => s.name);
    expect(bookNames).toContain(spell.name);
    expect(bookNames).toContain(cantrip.name);
    expect(await distinctBatchIds(CHAR_ID)).toHaveLength(1);
  });

  it("rejects a leveled spell submitted as a cantrip (400)", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    const spells = await prisma.spell.findMany({ where: { classes: { has: "warlock" }, level: 1 }, take: 2, select: { id: true } });
    expect(spells).toHaveLength(2);

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "charisma", amount: 2 }] },
      spellsLearned: [{ type: "learnSpell", spellId: spells[0].id }],
      cantripsLearned: [{ type: "learnSpell", spellId: spells[1].id }], // level-1 spell in the cantrip slot
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cantrip/i);
    // Nothing committed — the level check runs before the tx opens.
    expect(await eventCount(CHAR_ID)).toBe(0);
  });

  it("rejects a cantrip submitted as a leveled spell (400)", async () => {
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: CHAR_ID } });
    // Two distinct cantrips: one misplaced in the leveled slot, one valid in the cantrip slot.
    const [misplaced, validCantrip] = await prisma.spell.findMany({ where: { classes: { has: "warlock" }, level: 0 }, take: 2, select: { id: true } });
    expect(misplaced.id).not.toBe(validCantrip.id);

    const res = await post(CHAR_ID, {
      target: { kind: "existing", classEntryId: entry.id },
      hp: { method: "average" },
      advancement: { type: "takeAsi", increases: [{ ability: "charisma", amount: 2 }] },
      spellsLearned: [{ type: "learnSpell", spellId: misplaced.id }], // level-0 spell in the leveled slot
      cantripsLearned: [{ type: "learnSpell", spellId: validCantrip.id }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cantrip/i);
    expect(await eventCount(CHAR_ID)).toBe(0);
  });
});

// #1131: adding a first level in a new class routes through the SAME ceremony
// (target {kind:"new"}), not a creation-only fork. A caster second class picks
// its level-1 spells + cantrips; a Fighter second class commits its fighting style.
describe("POST …/level-up/transactions — multiclass add via ceremony (#1131)", () => {
  const CHAR_ID = "lvtx-mc-add";

  beforeEach(async () => {
    const rogue = await prisma.characterClass.findFirstOrThrow({ where: { name: "Rogue" } });
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        id: CHAR_ID,
        name: "LevelUpTx Multiclass",
        experiencePoints: 14000, // level 6 threshold; hitDice.total 5 → 1 pending
        hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 5, die: "d8", spent: 0 },
        // High across the board so any multiclass prerequisite is met.
        abilityScores: { strength: 15, dexterity: 15, constitution: 15, intelligence: 15, wisdom: 15, charisma: 15 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: { create: [{ name: "rogue", subclass: "Thief", classId: rogue.id, position: 0, level: 5 }] },
      },
    });
  });

  it("adds a Warlock second class and applies its 2 cantrips + 2 spells", async () => {
    const warlock = await prisma.characterClass.findFirstOrThrow({ where: { name: "Warlock" } });
    const cantrips = await prisma.spell.findMany({ where: { classes: { has: "warlock" }, level: 0 }, take: 2, select: { id: true } });
    const spells = await prisma.spell.findMany({ where: { classes: { has: "warlock" }, level: 1 }, take: 2, select: { id: true } });

    const res = await post(CHAR_ID, {
      target: { kind: "new", classId: warlock.id },
      hp: { method: "average" },
      spellsLearned: spells.map((s) => ({ type: "learnSpell", spellId: s.id })),
      cantripsLearned: cantrips.map((s) => ({ type: "learnSpell", spellId: s.id })),
    });

    expect(res.status).toBe(200);
    expect(res.body.classes.map((c: { name: string }) => c.name.toLowerCase())).toContain("warlock");
    // The 2 cantrips + 2 leveled spells are all learned into the new class's book.
    const book = res.body.spellcasting.spells as Array<{ level: number }>;
    expect(book).toHaveLength(4);
    expect(book.filter((s) => s.level === 0)).toHaveLength(2);
    expect(await distinctBatchIds(CHAR_ID)).toHaveLength(1);
  });

  it("adds a Fighter second class and commits its fighting-style feat against the new entry", async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    const defense = await prisma.feat.findFirstOrThrow({ where: { name: "Defense", category: "fighting_style" } });

    const res = await post(CHAR_ID, {
      target: { kind: "new", classId: fighter.id },
      hp: { method: "average" },
      fightingStyleFeat: { type: "takeFeat", featId: defense.id },
    });

    expect(res.status).toBe(200);
    expect(res.body.classes.map((c: { name: string }) => c.name.toLowerCase())).toContain("fighter");
    expect(res.body.advancements.some((a: { slot?: string; featName?: string }) => a.slot === "fightingStyle" && a.featName === "Defense")).toBe(true);
  });
});
