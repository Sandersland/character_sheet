/**
 * Elemental Discipline route + learn/forget/swap ops (issue #397).
 * Real Postgres in beforeEach, supertest against createApp(). The fixture is a
 * Way of the Four Elements monk whose XP (and thus level + discipline cap) is
 * chosen per test: L3 → cap 1, L6 → cap 2, L11 → cap 3.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../../app.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { ensureTestOwner } from "../../../test-support/owner.js";
import { authCookie } from "../../../test-support/auth.js";

const OWNER_ID = "owner-disciplines";
let COOKIE: string;

const FIXTURE_ID = "test-disciplines-character-1";
const MONK_CATALOG_NAME = "Disciplines Route Test Monk";

// XP thresholds → monk level (single-class): L3=900, L6=14000, L11=85000, L7=23000.
const XP_L3 = 900;
const XP_L6 = 14000;
const XP_L7 = 23000;
const XP_L11 = 85000;

// Unique catalog names so these tests don't depend on the seeded catalog.
const NAME_L3_A = "Disc Test Water Whip";
const NAME_L3_B = "Disc Test Fire Snake";
const NAME_L11 = "Disc Test Fireball";
const NAME_FREE = "Disc Test Attunement";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Disciplines Test Monk",
  alignment: "Lawful Neutral",
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 20, max: 20, temp: 0 },
  hitDice: { total: 3, die: "d8" },
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

const url = `/api/characters/${FIXTURE_ID}/resources/transactions`;
const activityUrl = `/api/characters/${FIXTURE_ID}/activity?category=resources`;

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
}
async function post(operations: unknown[]) {
  return agent().post(url).send({ operations });
}

interface Entry {
  id: string;
  name: string;
  disciplineId?: string;
  learnedAtLevel: number;
  lastSwapLevel: number | null;
}
function disciplines(res: { body: { resources: { disciplinesKnown: Entry[] } } }): Entry[] {
  return res.body.resources.disciplinesKnown;
}

interface ActivityEvent {
  type: string;
  summary: string;
  data?: Record<string, unknown>;
  batchId?: string;
}
async function activity(): Promise<ActivityEvent[]> {
  const res = await agent().get(activityUrl);
  return res.body as ActivityEvent[];
}

let classId: string;
let idL3a: string;
let idL3b: string;
let idL11: string;
let idFree: string;

async function createMonk(experiencePoints: number) {
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      experiencePoints,
      ownerId: OWNER_ID,
      resources: Prisma.JsonNull,
      classEntries: {
        create: [
          { name: "monk", subclass: "way of the four elements", classId, position: 0 },
        ],
      },
    },
  });
}

describe("Elemental disciplines", () => {
  afterAll(async () => {
    await prisma.grantedAbility.deleteMany({
      where: { name: { in: [NAME_L3_A, NAME_L3_B, NAME_L11, NAME_FREE] } },
    });
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
    classId = cls.id;

    const [l3a, l3b, l11, free] = await Promise.all([
      prisma.grantedAbility.upsert({
        where: { name: NAME_L3_A },
        create: { name: NAME_L3_A, description: "L3 test discipline A.", minLevel: 3 },
        update: { minLevel: 3, alwaysKnown: false },
      }),
      prisma.grantedAbility.upsert({
        where: { name: NAME_L3_B },
        create: { name: NAME_L3_B, description: "L3 test discipline B.", minLevel: 3 },
        update: { minLevel: 3, alwaysKnown: false },
      }),
      prisma.grantedAbility.upsert({
        where: { name: NAME_L11 },
        create: { name: NAME_L11, description: "L11 test discipline.", minLevel: 11 },
        update: { minLevel: 11, alwaysKnown: false },
      }),
      prisma.grantedAbility.upsert({
        where: { name: NAME_FREE },
        create: { name: NAME_FREE, description: "Always-known test discipline.", minLevel: 3, alwaysKnown: true },
        update: { minLevel: 3, alwaysKnown: true },
      }),
    ]);
    idL3a = l3a.id;
    idL3b = l3b.id;
    idL11 = l11.id;
    idFree = free.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  // ── GET /api/disciplines ────────────────────────────────────────────────────

  it("GET /disciplines returns the catalog with min level + always-known flag", async () => {
    const res = await agent().get("/api/disciplines");
    expect(res.status).toBe(200);
    const rows = res.body as Array<{ name: string; minLevel: number; alwaysKnown: boolean }>;
    const free = rows.find((r) => r.name === NAME_FREE)!;
    expect(free.alwaysKnown).toBe(true);
    const l11 = rows.find((r) => r.name === NAME_L11)!;
    expect(l11.minLevel).toBe(11);
    // The full PHB catalog (~17) is seeded.
    expect(rows.length).toBeGreaterThanOrEqual(17);
  });

  it("catalog rows carry an embedded AbilityCost + EffectSpec", async () => {
    const res = await agent().get("/api/disciplines");
    const rows = res.body as Array<{ name: string; cost: unknown; effect: unknown }>;
    const fireball = rows.find((r) => r.name === "Flames of the Phoenix");
    expect(fireball).toBeDefined();
    expect(fireball!.cost).toMatchObject({ kind: "pool", key: "ki", base: 4 });
    expect(fireball!.effect).toMatchObject({ effectType: "damage", saveAbility: "dexterity" });
  });

  // ── learn (cap + level gate) ────────────────────────────────────────────────

  it("a L3 monk can learn 1 discipline; a 2nd is rejected until level up", async () => {
    await createMonk(XP_L3);
    const first = await post([{ type: "learnDiscipline", disciplineId: idL3a }]);
    expect(first.status).toBe(200);
    expect(disciplines(first)).toHaveLength(1);
    expect(disciplines(first)[0].learnedAtLevel).toBe(3);
    expect(disciplines(first)[0].lastSwapLevel).toBeNull();

    const second = await post([{ type: "learnDiscipline", disciplineId: idL3b }]);
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/already know 1\/1/);
  });

  it("a L6 monk can learn 2 disciplines (Elemental Attunement stays free)", async () => {
    await createMonk(XP_L6);
    await post([{ type: "learnDiscipline", disciplineId: idL3a }]);
    const res = await post([{ type: "learnDiscipline", disciplineId: idL3b }]);
    expect(res.status).toBe(200);
    expect(disciplines(res)).toHaveLength(2);
    // The picker reads these derived, serialized fields (issue #399).
    expect(res.body.resources.disciplineChoiceCount).toBe(2);
    expect(res.body.resources.disciplineSaveDC).toBeGreaterThan(0);
  });

  it("a level-11 discipline cannot be learned at level 6", async () => {
    await createMonk(XP_L6);
    const res = await post([{ type: "learnDiscipline", disciplineId: idL11 }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/requires monk level 11/);
    // But is learnable at L11.
    await prisma.character.update({ where: { id: FIXTURE_ID }, data: { experiencePoints: XP_L11 } });
    const ok = await post([{ type: "learnDiscipline", disciplineId: idL11 }]);
    expect(ok.status).toBe(200);
  });

  it("an always-known discipline cannot be learned", async () => {
    await createMonk(XP_L3);
    const res = await post([{ type: "learnDiscipline", disciplineId: idFree }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/always known/);
  });

  it("rejects a duplicate learn of the same catalog discipline", async () => {
    await createMonk(XP_L6);
    await post([{ type: "learnDiscipline", disciplineId: idL3a }]);
    const dup = await post([{ type: "learnDiscipline", disciplineId: idL3a }]);
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/already known/);
  });

  // ── forget ──────────────────────────────────────────────────────────────────

  it("forgetDiscipline removes a known discipline and is audited", async () => {
    await createMonk(XP_L3);
    const learn = await post([{ type: "learnDiscipline", disciplineId: idL3a }]);
    const entryId = disciplines(learn)[0].id;
    const res = await post([{ type: "forgetDiscipline", entryId }]);
    expect(res.status).toBe(200);
    expect(disciplines(res)).toHaveLength(0);

    const events = await activity();
    expect(events[0].type).toBe("forgetDiscipline");
  });

  // ── swap (retraining) ────────────────────────────────────────────────────────

  it("swap replaces a discipline; a 2nd swap at the same level is rejected; after level up it's allowed", async () => {
    await createMonk(XP_L6);
    const learn = await post([
      { type: "learnDiscipline", disciplineId: idL3a },
      { type: "learnDiscipline", disciplineId: idL3b },
    ]);
    const entryA = disciplines(learn).find((d) => d.disciplineId === idL3a)!;
    const entryB = disciplines(learn).find((d) => d.disciplineId === idL3b)!;

    // Swap A → L11 discipline (learnable at L6? no — pick a legal L3 target instead).
    // Replace A's slot with a custom L3 discipline.
    const swap1 = await post([
      { type: "swapDiscipline", entryId: entryA.id, custom: { name: "Retrained One", description: "d" } },
    ]);
    expect(swap1.status).toBe(200);
    const swapped = disciplines(swap1).find((d) => d.name === "Retrained One")!;
    expect(swapped).toBeDefined();
    expect(swapped.lastSwapLevel).toBe(6);
    expect(disciplines(swap1)).toHaveLength(2);

    const events = await activity();
    expect(events[0].type).toBe("swapDiscipline");

    // Second swap at the same monk level → rejected.
    const swap2 = await post([
      { type: "swapDiscipline", entryId: entryB.id, custom: { name: "Retrained Two", description: "d" } },
    ]);
    expect(swap2.status).toBe(400);
    expect(swap2.body.error).toMatch(/Already swapped a discipline at monk level 6/);

    // Level up to 7 → swap allowed again.
    await prisma.character.update({ where: { id: FIXTURE_ID }, data: { experiencePoints: XP_L7 } });
    const swap3 = await post([
      { type: "swapDiscipline", entryId: entryB.id, custom: { name: "Retrained Three", description: "d" } },
    ]);
    expect(swap3.status).toBe(200);
    const swapped3 = disciplines(swap3).find((d) => d.name === "Retrained Three")!;
    expect(swapped3.lastSwapLevel).toBe(7);
    expect(disciplines(swap3)).toHaveLength(2);
  });

  it("swap into an already-known discipline is rejected", async () => {
    await createMonk(XP_L6);
    const learn = await post([
      { type: "learnDiscipline", disciplineId: idL3a },
      { type: "learnDiscipline", disciplineId: idL3b },
    ]);
    const entryA = disciplines(learn).find((d) => d.disciplineId === idL3a)!;
    const res = await post([{ type: "swapDiscipline", entryId: entryA.id, disciplineId: idL3b }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already known/);
  });

  it("swap is undoable via the audit log (before/after snapshots restore state)", async () => {
    await createMonk(XP_L6);
    const learn = await post([{ type: "learnDiscipline", disciplineId: idL3a }]);
    const entryA = disciplines(learn)[0];
    const swap = await post([
      { type: "swapDiscipline", entryId: entryA.id, disciplineId: idL3b },
    ]);
    expect(disciplines(swap)[0].disciplineId).toBe(idL3b);

    // Undo the most-recent (swap) batch via the LIFO revert endpoint.
    const events = await activity();
    const batchId = events[0].batchId!;
    const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`);
    expect(undo.status).toBe(200);
    const known = undo.body.resources.disciplinesKnown as Entry[];
    expect(known).toHaveLength(1);
    expect(known[0].disciplineId).toBe(idL3a);
  });
});
