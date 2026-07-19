import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-level-up-plan";
const OWNER_ID_2 = "owner-level-up-plan-2";
let COOKIE: string;
let COOKIE_2: string;
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

function getPlan(characterId: string, query = "", cookie = COOKIE) {
  return supertest(app)
    .get(`/api/characters/${characterId}/level-up/plan${query}`)
    .set("Cookie", cookie);
}

async function makeFighter(opts: { id: string; xp: number; hitDiceTotal: number; entryLevel: number; subclass: string | null }): Promise<string> {
  const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
  await prisma.character.create({
    data: {
      ...BASE,
      ownerId: OWNER_ID,
      id: opts.id,
      name: `LevelUpPlan ${opts.id}`,
      experiencePoints: opts.xp,
      hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: opts.hitDiceTotal, die: "d10", spent: 0 },
      abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 13, wisdom: 10, charisma: 10 },
      spellcasting: Prisma.JsonNull,
      classEntries: {
        create: [{ name: "fighter", subclass: opts.subclass, classId: fighter.id, position: 0, level: opts.entryLevel }],
      },
    },
  });
  const entry = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: opts.id } });
  return entry.id;
}

async function makeCleric(opts: { id: string; xp: number; entryLevel: number }): Promise<void> {
  const cleric = await prisma.characterClass.findFirstOrThrow({ where: { name: "Cleric" } });
  await prisma.character.create({
    data: {
      ...BASE,
      ownerId: OWNER_ID,
      id: opts.id,
      name: `LevelUpPlan ${opts.id}`,
      experiencePoints: opts.xp,
      hitPoints: { current: 20, max: 20, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: opts.entryLevel, die: "d8", spent: 0 },
      abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 16, charisma: 8 },
      spellcasting: { slotsUsed: {}, spells: [] } as Prisma.InputJsonValue,
      classEntries: {
        create: [{ name: "cleric", subclass: null, classId: cleric.id, position: 0, level: opts.entryLevel }],
      },
    },
  });
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  await ensureTestOwner(OWNER_ID_2);
  COOKIE = await authCookie(OWNER_ID);
  COOKIE_2 = await authCookie(OWNER_ID_2);
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "LevelUpPlan" } } });
});

describe("GET /api/characters/:id/level-up/plan", () => {
  it("returns target + ordered steps for the default (primary) entry", async () => {
    await makeFighter({ id: "lvplan-fighter-8", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });

    const res = await getPlan("lvplan-fighter-8");
    expect(res.status).toBe(200);
    expect(res.body.target).toEqual({ className: "fighter", subclass: "Champion", newLevel: 8, isPrimary: true });
    expect(res.body.steps.map((s: { kind: string }) => s.kind)).toEqual(["hitPoints", "advancement", "review"]);
  });

  it("surfaces only the subclass step at a subclass level, then re-plans when ?subclassId is given", async () => {
    const entryId = await makeFighter({ id: "lvplan-fighter-3", xp: 900, hitDiceTotal: 2, entryLevel: 2, subclass: null });
    const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { name: "Battle Master" } });

    const base = await getPlan("lvplan-fighter-3", `?classEntryId=${entryId}`);
    expect(base.status).toBe(200);
    expect(base.body.target.subclass).toBeNull();
    expect(base.body.steps.map((s: { kind: string }) => s.kind)).toEqual(["hitPoints", "subclass", "review"]);

    const replanned = await getPlan("lvplan-fighter-3", `?classEntryId=${entryId}&subclassId=${battleMaster.id}`);
    expect(replanned.status).toBe(200);
    expect(replanned.body.target.subclass).toBe("Battle Master");
    expect(replanned.body.steps.map((s: { kind: string }) => s.kind)).toEqual([
      "hitPoints", "subclass", "maneuvers", "toolProficiency", "review",
    ]);
  });

  it("offers the cleric subclass step at level 3 but not at level 2 (2024 grant, #1128)", async () => {
    // The primary plan targets entry.level + 1, so entryLevel 2 plans the 2→3 step.
    await makeCleric({ id: "lvplan-cleric-3", xp: 900, entryLevel: 2 });
    const atThree = await getPlan("lvplan-cleric-3");
    expect(atThree.status).toBe(200);
    expect(atThree.body.target).toMatchObject({ className: "cleric", subclass: null, newLevel: 3 });
    expect(atThree.body.steps.map((s: { kind: string }) => s.kind)).toContain("subclass");

    await makeCleric({ id: "lvplan-cleric-2", xp: 300, entryLevel: 1 });
    const atTwo = await getPlan("lvplan-cleric-2");
    expect(atTwo.status).toBe(200);
    expect(atTwo.body.target.newLevel).toBe(2);
    expect(atTwo.body.steps.map((s: { kind: string }) => s.kind)).not.toContain("subclass");
  });

  it("kind:new (?classId) plans a fresh multiclass entry: newLevel 1, not primary", async () => {
    await makeFighter({ id: "lvplan-multiclass", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });

    const res = await getPlan("lvplan-multiclass", `?classId=${wizard.id}`);
    expect(res.status).toBe(200);
    // A kind:"new" target reads className from the catalog row (capitalized),
    // unlike kind:"existing" which reads the entry's persisted name.
    expect(res.body.target).toMatchObject({ className: "Wizard", newLevel: 1, isPrimary: false });
  });

  it("400s on an unknown classEntryId", async () => {
    await makeFighter({ id: "lvplan-badentry", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const res = await getPlan("lvplan-badentry", "?classEntryId=nonexistent-entry");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/class entry not found/i);
  });

  it("400s when classEntryId and classId are both given", async () => {
    await makeFighter({ id: "lvplan-bothparams", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    const res = await getPlan("lvplan-bothparams", "?classEntryId=a&classId=b");
    expect(res.status).toBe(400);
  });

  it("404s on a nonexistent character and 403s for a foreign owner", async () => {
    expect((await getPlan("lvplan-does-not-exist")).status).toBe(404);
    await makeFighter({ id: "lvplan-foreign", xp: 34000, hitDiceTotal: 7, entryLevel: 7, subclass: "Champion" });
    expect((await getPlan("lvplan-foreign", "", COOKIE_2)).status).toBe(403);
  });
});
