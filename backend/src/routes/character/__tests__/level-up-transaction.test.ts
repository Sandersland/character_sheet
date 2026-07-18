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

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
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
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { name: "fighter", subclass: "Champion" } });

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
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { name: "fighter", subclass: "Champion" } });
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
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { name: "fighter", subclass: null } });
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
    const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { name: "wizard" } });
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
});
