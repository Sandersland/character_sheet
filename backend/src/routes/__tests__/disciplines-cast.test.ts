/**
 * Elemental Discipline cast endpoint (issue #398): POST /disciplines/transactions.
 * Real Postgres + supertest. Fixture is a Way of the Four Elements monk whose XP
 * (level → ki total + per-cast ki cap + save DC) is chosen per test. Disciplines
 * are read from the seeded catalog by name.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { authCookie } from "../../test-support/auth.js";

const OWNER_ID = "owner-disc-cast";
let COOKIE: string;

const FIXTURE_ID = "test-disc-cast-monk-1";
const CLASS_NAME = "Disc Cast Test Monk";

// XP thresholds → monk level: L3=900, L5=6500.
const XP_L3 = 900;
const XP_L5 = 6500;

const url = `/api/characters/${FIXTURE_ID}/disciplines/transactions`;
const resourcesUrl = `/api/characters/${FIXTURE_ID}/resources/transactions`;
const activityUrl = `/api/characters/${FIXTURE_ID}/activity?category=resources`;

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Disc Cast Test Monk",
  alignment: "Lawful Neutral",
  initiativeBonus: 2,
  speed: 40,
  hitPoints: { current: 24, max: 24, temp: 0 },
  hitDice: { total: 3, die: "d8" },
  abilityScores: {
    strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 15, charisma: 10,
  },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
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
let waterWhipId: string;   // L3, base 2, dex save, 3d10 +1d10/ki
let attunementId: string;  // alwaysKnown, no ki, utility
let galeSpiritsId: string; // L3, base 2, gust of wind (concentration)

async function createMonk(experiencePoints: number) {
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      experiencePoints,
      ownerId: OWNER_ID,
      resources: Prisma.JsonNull,
      classEntries: {
        create: [{ name: "monk", subclass: "way of the four elements", classId, position: 0 }],
      },
    },
  });
}

async function learn(disciplineId: string) {
  const res = await agent().post(resourcesUrl).send({ operations: [{ type: "learnDiscipline", disciplineId }] });
  expect(res.status).toBe(200);
}

describe("Discipline cast endpoint", () => {
  beforeAll(async () => {
    const cls = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME },
      create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics", "stealth"], isSpellcaster: false },
      update: {},
    });
    classId = cls.id;

    const [ww, att, gale] = await Promise.all([
      prisma.discipline.findUnique({ where: { name: "Water Whip" } }),
      prisma.discipline.findUnique({ where: { name: "Elemental Attunement" } }),
      prisma.discipline.findUnique({ where: { name: "Rush of the Gale Spirits" } }),
    ]);
    waterWhipId = ww!.id;
    attunementId = att!.id;
    galeSpiritsId = gale!.id;
  });

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("casts a learned L3 discipline: spends ki via the pool path, logs the roll + ki DC", async () => {
    await createMonk(XP_L3);
    await learn(waterWhipId);

    const res = await cast([{ type: "castDiscipline", disciplineId: waterWhipId, kiSpent: 2, roll: 15 }]);
    expect(res.status).toBe(200);

    const ki = res.body.resources.pools.find((p: { key: string }) => p.key === "ki");
    expect(ki.used).toBe(2);

    const events = await activity();
    const castEvent = events.find((e) => e.type === "castDiscipline")!;
    expect(castEvent).toBeDefined();
    // Ki DC = 8 + prof(2 at L3) + Wis mod(+2) = 12.
    expect(castEvent.data).toMatchObject({ disciplineId: waterWhipId, kiSpent: 2, roll: 15, saveDc: 12 });
    expect(castEvent.summary).toMatch(/save DC 12/);
    // The pool path logs its own spendResource event in the same batch.
    expect(events.some((e) => e.type === "spendResource")).toBe(true);
  });

  it("rejects ki below the base cost and above the per-cast cap", async () => {
    await createMonk(XP_L3);
    await learn(waterWhipId);

    const tooLow = await cast([{ type: "castDiscipline", disciplineId: waterWhipId, kiSpent: 1, roll: 10 }]);
    expect(tooLow.status).toBe(400);
    // At L3 the per-cast cap is 2 ki; 3 is rejected.
    const tooHigh = await cast([{ type: "castDiscipline", disciplineId: waterWhipId, kiSpent: 3, roll: 30 }]);
    expect(tooHigh.status).toBe(400);
  });

  it("allows extra ki up to the cap at higher level (scaling headroom)", async () => {
    await createMonk(XP_L5);
    await learn(waterWhipId);

    // At L5 the cap is 3 ki; base 2 + 1 extra step is allowed.
    const res = await cast([{ type: "castDiscipline", disciplineId: waterWhipId, kiSpent: 3, roll: 22 }]);
    expect(res.status).toBe(200);
    const ki = res.body.resources.pools.find((p: { key: string }) => p.key === "ki");
    expect(ki.used).toBe(3);
  });

  it("casts a utility (always-known) discipline with no ki and no dice", async () => {
    await createMonk(XP_L3);
    // Elemental Attunement is always known — no learn step needed.
    const res = await cast([{ type: "castDiscipline", disciplineId: attunementId, kiSpent: 0, roll: 0 }]);
    expect(res.status).toBe(200);
    const ki = res.body.resources.pools.find((p: { key: string }) => p.key === "ki");
    expect(ki.used).toBe(0);

    const events = await activity();
    expect(events.some((e) => e.type === "castDiscipline")).toBe(true);
  });

  it("rejects casting a discipline the monk hasn't learned", async () => {
    await createMonk(XP_L3);
    const res = await cast([{ type: "castDiscipline", disciplineId: waterWhipId, kiSpent: 2, roll: 15 }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not known/i);
  });

  it("routes a concentration discipline through the shared slot, dropping a prior concentration", async () => {
    await createMonk(XP_L3);
    await learn(galeSpiritsId);

    // Seed a prior concentration (a spell) directly in the spellcasting blob.
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: {
        spellcasting: {
          slotsUsed: {}, arcanumUsed: {}, spells: [{ id: "prior-spell", name: "Bless", level: 1, prepared: true }],
          concentratingOn: { entryId: "prior-spell", spellName: "Bless" },
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const res = await cast([{ type: "castDiscipline", disciplineId: galeSpiritsId, kiSpent: 2, roll: 0 }]);
    expect(res.status).toBe(200);

    // Concentration is recorded on the discipline in the stored blob.
    const row = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { spellcasting: true } });
    const stored = row!.spellcasting as { concentratingOn: { entryId: string; spellName: string } | null };
    expect(stored.concentratingOn).toMatchObject({ entryId: galeSpiritsId, spellName: "Rush of the Gale Spirits" });

    // The prior concentration was auto-dropped (logged under the spellcasting category).
    const spellEvents = await agent().get(`/api/characters/${FIXTURE_ID}/activity?category=spellcasting`);
    expect((spellEvents.body as ActivityEvent[]).some((e) => e.type === "concentrationDropped")).toBe(true);
  });

  it("logs an undoable castDiscipline batch (revert restores the spent ki)", async () => {
    await createMonk(XP_L3);
    await learn(waterWhipId);
    const casted = await cast([{ type: "castDiscipline", disciplineId: waterWhipId, kiSpent: 2, roll: 15 }]);
    const kiBefore = casted.body.resources.pools.find((p: { key: string }) => p.key === "ki");
    expect(kiBefore.used).toBe(2);

    const events = await activity();
    const batchId = events.find((e) => e.type === "castDiscipline")!.batchId!;
    const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`);
    expect(undo.status).toBe(200);
    const ki = undo.body.resources.pools.find((p: { key: string }) => p.key === "ki");
    expect(ki.used).toBe(0);
  });

  it("rejects a discipline cast from a non-Four-Elements character", async () => {
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        experiencePoints: XP_L3,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: { create: [{ name: "monk", subclass: null, classId, position: 0 }] },
      },
    });
    const res = await cast([{ type: "castDiscipline", disciplineId: attunementId, kiSpent: 0, roll: 0 }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Four Elements/i);
  });
});
