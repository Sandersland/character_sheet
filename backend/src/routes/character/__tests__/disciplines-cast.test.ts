/**
 * Way of the Four Elements discipline cast endpoint (2014-only, #1503):
 * POST /abilities/disciplines/transactions. Real Postgres + supertest.
 * Fixture is a Way of the Four Elements monk whose XP sets the level and
 * whose `resources.choicesKnown.fourElementsDisciplines` seeds known
 * disciplines directly (the learn/forget flow itself is the generic
 * learnSubclassChoice/forgetSubclassChoice machinery, already covered by
 * resources.ts's own tests — this file covers the CAST).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { readPinnedEvents } from "@/test-support/events.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-discipline-cast";
let COOKIE: string;

const FIXTURE_ID = "test-discipline-cast-monk-1";

// XP thresholds -> monk level: L3=900, L5=6500, L11=85000.
const XP_L2 = 300;
const XP_L3 = 900;
const XP_L5 = 6500;
const XP_L11 = 85000;

const url = `/api/characters/${FIXTURE_ID}/abilities/disciplines/transactions`;
const activityUrl = `/api/characters/${FIXTURE_ID}/activity?category=resources`;

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Discipline Cast Test Monk",
  alignment: "Neutral",
  initiativeBonus: 3,
  speed: 40,
  hitPoints: { current: 40, max: 40, temp: 0 },
  hitDice: { total: 5, die: "d8" },
  abilityScores: {
    strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10,
  },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: ["stealth"],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  rulesEdition: "EDITION_2014" as const,
};

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}
async function cast(operations: unknown[]) {
  return agent().post(url).send({ operations });
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
let disciplinesByName: Record<string, { id: string }>;

// Seeds resources.choicesKnown.fourElementsDisciplines directly — bypasses
// the learn flow (already covered generically by resources.ts tests) so this
// file's own fixtures can pin a known entryId per test.
function knownDiscipline(entryId: string, name: string) {
  return { id: entryId, optionId: disciplinesByName[name].id, name, description: "fixture" };
}

async function createMonk(experiencePoints: number, known: ReturnType<typeof knownDiscipline>[]) {
  const sub = await prisma.subclass.findFirst({
    where: { classId, name: { equals: "Way of the Four Elements", mode: "insensitive" } },
    select: { id: true },
  });
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      experiencePoints,
      ownerId: OWNER_ID,
      resources: {
        used: {},
        maneuversKnown: [],
        toolProficienciesKnown: [],
        choicesKnown: { fourElementsDisciplines: known },
        advancements: [],
      } as unknown as Prisma.InputJsonValue,
      classEntries: {
        create: [{ name: "monk", subclass: "way of the four elements", subclassId: sub?.id, classId, position: 0 }],
      },
    },
  });
}

describe("Discipline cast endpoint (#1503)", () => {
  beforeAll(async () => {
    const cls = await prisma.characterClass.upsert({
      where: { name: "Discipline Cast Test Monk Class" },
      create: {
        name: "Discipline Cast Test Monk Class",
        hitDie: "d8",
        savingThrows: ["strength", "dexterity"],
        skillChoiceCount: 2,
        skillChoices: ["acrobatics", "stealth"],
        isSpellcaster: false,
      },
      update: {},
    });
    classId = cls.id;

    const rows = await prisma.grantedAbility.findMany({ where: { source: "discipline" } });
    if (rows.length !== 16) throw new Error(`discipline catalog not seeded (${rows.length}/16) — run \`prisma db seed\``);
    disciplinesByName = Object.fromEntries(rows.map((r) => [r.name, { id: r.id }]));
  });

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: "Discipline Cast Test Monk Class" } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  // Concentration is asserted by reading `spellcasting` straight off the DB
  // row, not the serialized wire body: `spellcasting` is omitted from the
  // wire entirely for a character with zero granted spells (spellcasting.ts's
  // own `granted.length === 0 && …` early-return) — this fixture's throwaway
  // test subclass grants none (Way of the Four Elements grants no spells in
  // real content either), so the DB is the only reliable read here.
  async function dbConcentratingOn(): Promise<unknown> {
    const row = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { spellcasting: true } });
    return (row!.spellcasting as { concentratingOn: unknown } | null)?.concentratingOn ?? null;
  }

  it("casts a base-cost, non-concentrating, damage discipline (Fangs of the Fire Snake) — spends 1 ki, no concentration", async () => {
    await createMonk(XP_L3, [knownDiscipline("e1", "Fangs of the Fire Snake")]);
    const res = await cast([{ type: "castDiscipline", entryId: "e1", roll: 7 }]);
    expect(res.status).toBe(200);
    const ki = res.body.resources.pools.find((p: { key: string }) => p.key === "ki");
    expect(ki.used).toBe(1);
    expect(await dbConcentratingOn()).toBeNull();

    const events = await activity();
    const castEvent = events.find((e) => e.type === "castDiscipline")!;
    expect(castEvent.data).toMatchObject({ entryId: "e1", kiSpent: 1, roll: 7 });
    expect(events.some((e) => e.type === "spendResource")).toBe(true);
  });

  it("overspending ki scales the discipline's damage (poolStep) and spends the requested amount", async () => {
    await createMonk(XP_L5, [knownDiscipline("e1", "Fangs of the Fire Snake")]);
    // Fangs costs 1 base + 1/step; monk L5's per-cast cap is 3 (PHB'14 p.80).
    const res = await cast([{ type: "castDiscipline", entryId: "e1", requestedKi: 3, roll: 30 }]);
    expect(res.status).toBe(200);
    expect(res.body.resources.pools.find((p: { key: string }) => p.key === "ki").used).toBe(3);
  });

  it("casting a concentrating discipline (Rush of the Gale Spirits) establishes concentration", async () => {
    await createMonk(XP_L3, [knownDiscipline("e1", "Rush of the Gale Spirits")]);
    const res = await cast([{ type: "castDiscipline", entryId: "e1" }]);
    expect(res.status).toBe(200);
    expect(res.body.resources.pools.find((p: { key: string }) => p.key === "ki").used).toBe(2);
    expect(await dbConcentratingOn()).toMatchObject({ entryId: "e1", spellName: "Rush of the Gale Spirits" });
  });

  it("rejects a cast spending more ki than the per-cast cap (L3 cap 2, requesting 3)", async () => {
    await createMonk(XP_L3, [knownDiscipline("e1", "Fangs of the Fire Snake")]);
    const res = await cast([{ type: "castDiscipline", entryId: "e1", requestedKi: 3, roll: 10 }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1-2 ki at monk level 3/);
  });

  it("rejects a cast of a discipline above the character's level (Eternal Mountain Defense, minLevel 13)", async () => {
    await createMonk(XP_L11, [knownDiscipline("e1", "Eternal Mountain Defense")]);
    const res = await cast([{ type: "castDiscipline", entryId: "e1" }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/requires monk level 13/);
  });

  it("rejects a cast of a discipline not known", async () => {
    await createMonk(XP_L3, []);
    const res = await cast([{ type: "castDiscipline", entryId: "not-known" }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not known/);
  });

  it("rejects a cast from a sub-L3 Four Elements monk", async () => {
    await createMonk(XP_L2, [knownDiscipline("e1", "Fangs of the Fire Snake")]);
    const res = await cast([{ type: "castDiscipline", entryId: "e1", roll: 5 }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/level 3/i);
  });

  it("rejects a cast from a non-Four-Elements monk", async () => {
    await createMonk(XP_L3, [knownDiscipline("e1", "Fangs of the Fire Snake")]);
    await prisma.characterClassEntry.updateMany({ where: { characterId: FIXTURE_ID }, data: { subclass: "warrior of the open hand", subclassId: null } });
    const res = await cast([{ type: "castDiscipline", entryId: "e1", roll: 5 }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Way of the Four Elements/i);
  });

  it("rejects a damage discipline cast with no positive roll", async () => {
    await createMonk(XP_L3, [knownDiscipline("e1", "Fangs of the Fire Snake")]);
    const res = await cast([{ type: "castDiscipline", entryId: "e1" }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive damage roll/);
  });

  it("a utility discipline (Shape the Flowing River) needs no roll and deals no damage", async () => {
    await createMonk(XP_L3, [knownDiscipline("e1", "Shape the Flowing River")]);
    const res = await cast([{ type: "castDiscipline", entryId: "e1" }]);
    expect(res.status).toBe(200);
    expect(res.body.resources.pools.find((p: { key: string }) => p.key === "ki").used).toBe(1);
  });

  it("logs an undoable cast: revert refunds ki and restores concentration to null", async () => {
    await createMonk(XP_L3, [knownDiscipline("e1", "Rush of the Gale Spirits")]);
    const casted = await cast([{ type: "castDiscipline", entryId: "e1" }]);
    expect(casted.body.resources.pools.find((p: { key: string }) => p.key === "ki").used).toBe(2);

    const events = await activity();
    const batchId = events.find((e) => e.type === "castDiscipline")!.batchId!;
    const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`);
    expect(undo.status).toBe(200);
    expect(undo.body.resources.pools.find((p: { key: string }) => p.key === "ki").used).toBe(0);

    const reverted = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { spellcasting: true } });
    expect((reverted!.spellcasting as { concentratingOn: unknown }).concentratingOn).toBeNull();
  });

  // #1503 AC: castDiscipline's audit trail is exactly a spendResource +
  // castDiscipline pair (+ a concentration event for a concentrating cast).
  it("pins the audit trail of a non-concentrating cast (spendResource + castDiscipline, no concentration event)", async () => {
    await createMonk(XP_L3, [knownDiscipline("e1", "Fangs of the Fire Snake")]);
    const res = await cast([{ type: "castDiscipline", entryId: "e1", roll: 7 }]);
    expect(res.status).toBe(200);

    const events = await readPinnedEvents(FIXTURE_ID);
    expect(events.map((e) => e.category + ":" + e.type)).toEqual(["resources:castDiscipline", "resources:spendResource"]);
  });
});

describe("GET /api/subclass-choices/discipline (#1503)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  it("returns the 16-row 2014 catalog with cost + alwaysKnown; 2024 gets none", async () => {
    const as2014 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/subclass-choices/discipline?edition=EDITION_2014");
    expect(as2014.status).toBe(200);
    expect((as2014.body as unknown[]).length).toBe(16);
    const fangs = (as2014.body as { name: string; cost: unknown; alwaysKnown: boolean; minLevel: number }[]).find(
      (r) => r.name === "Fangs of the Fire Snake",
    )!;
    expect(fangs.cost).toEqual({ kind: "pool", key: "ki", base: 1, perStep: 1 });
    expect(fangs.alwaysKnown).toBe(false);
    expect(fangs.minLevel).toBe(3);

    const as2024 = await supertest.agent(app).set("Cookie", COOKIE).get("/api/subclass-choices/discipline?edition=EDITION_2024");
    expect(as2024.status).toBe(200);
    expect((as2024.body as unknown[]).length).toBe(0);
  });
});
