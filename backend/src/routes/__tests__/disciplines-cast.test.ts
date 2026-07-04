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
import { disciplineEffectSpec, maxKiPerDiscipline } from "../../lib/disciplines.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";
import { authCookie } from "../../test-support/auth.js";

const OWNER_ID = "owner-disc-cast";
let COOKIE: string;

const FIXTURE_ID = "test-disc-cast-monk-1";
const CLASS_NAME = "Disc Cast Test Monk";

// XP thresholds → monk level: L3=900, L5=6500, L6=14000, L11=85000, L17=225000.
const XP_L3 = 900;
const XP_L5 = 6500;
const XP_L6 = 14000;
const XP_L11 = 85000;
const XP_L17 = 225000;

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
      prisma.grantedAbility.findUnique({ where: { name: "Water Whip" } }),
      prisma.grantedAbility.findUnique({ where: { name: "Elemental Attunement" } }),
      prisma.grantedAbility.findUnique({ where: { name: "Rush of the Gale Spirits" } }),
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

  it("reverting a fresh concentration discipline cast clears the phantom concentration", async () => {
    await createMonk(XP_L3);
    await learn(galeSpiritsId);

    // No prior concentration — a fresh one is established by the cast.
    const res = await cast([{ type: "castDiscipline", disciplineId: galeSpiritsId, kiSpent: 2, roll: 0 }]);
    expect(res.status).toBe(200);
    const afterCast = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { spellcasting: true } });
    expect((afterCast!.spellcasting as { concentratingOn: unknown }).concentratingOn).toMatchObject({ entryId: galeSpiritsId });

    // Undo the batch — concentratingOn must return to null (not a phantom).
    const events = await activity();
    const batchId = events.find((e) => e.type === "castDiscipline")!.batchId!;
    const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`);
    expect(undo.status).toBe(200);
    const reverted = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { spellcasting: true } });
    expect((reverted!.spellcasting as { concentratingOn: unknown }).concentratingOn).toBeNull();
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

  // ── L6 / L11 / L17 disciplines (issue #425) ──────────────────────────────────

  interface HighLevelCase {
    name: string;
    xp: number;
    level: number;
    base: number;
    cap: number;
    dc?: number; // only save-bearing disciplines log a DC
  }

  // dc = 8 + prof + Wis mod(+2); cap = maxKiPerDiscipline(level).
  const HIGH_LEVEL: HighLevelCase[] = [
    { name: "Clench of the North Wind", xp: XP_L6, level: 6, base: 3, cap: 3, dc: 13 },
    { name: "Gong of the Summit", xp: XP_L6, level: 6, base: 3, cap: 3, dc: 13 },
    { name: "Flames of the Phoenix", xp: XP_L11, level: 11, base: 4, cap: 4, dc: 14 },
    { name: "Mist Stance", xp: XP_L11, level: 11, base: 4, cap: 4 },
    { name: "Ride the Wind", xp: XP_L11, level: 11, base: 4, cap: 4 },
    { name: "Breath of Winter", xp: XP_L17, level: 17, base: 6, cap: 6, dc: 16 },
    { name: "Eternal Mountain Defense", xp: XP_L17, level: 17, base: 5, cap: 6 },
    { name: "River of Hungry Flame", xp: XP_L17, level: 17, base: 5, cap: 6, dc: 16 },
    { name: "Wave of Rolling Earth", xp: XP_L17, level: 17, base: 6, cap: 6 },
  ];

  for (const c of HIGH_LEVEL) {
    it(`casts ${c.name} at its base ki cost with the right cap and DC`, async () => {
      await createMonk(c.xp);
      const disc = await prisma.grantedAbility.findUnique({ where: { name: c.name } });
      expect(disc).not.toBeNull();
      await learn(disc!.id);

      expect(maxKiPerDiscipline(c.level)).toBe(c.cap);
      const res = await cast([{ type: "castDiscipline", disciplineId: disc!.id, kiSpent: c.base, roll: c.dc ? 20 : 0 }]);
      expect(res.status).toBe(200);
      const ki = res.body.resources.pools.find((p: { key: string }) => p.key === "ki");
      expect(ki.used).toBe(c.base);

      const events = await activity();
      const castEvent = events.find(
        (e) => e.type === "castDiscipline" && (e.data as { disciplineId?: string })?.disciplineId === disc!.id,
      )!;
      expect(castEvent).toBeDefined();
      expect(castEvent.data).toMatchObject({ disciplineId: disc!.id, kiSpent: c.base });
      if (c.dc !== undefined) {
        expect(castEvent.data).toMatchObject({ saveDc: c.dc });
        expect(castEvent.summary).toMatch(new RegExp(`save DC ${c.dc}`));
      }
    });
  }

  it("rejects ki above the per-cast cap for a high-level discipline", async () => {
    await createMonk(XP_L6); // per-cast cap is 3 ki at L6
    const gong = await prisma.grantedAbility.findUnique({ where: { name: "Gong of the Summit" } });
    await learn(gong!.id);
    const res = await cast([{ type: "castDiscipline", disciplineId: gong!.id, kiSpent: 4, roll: 20 }]);
    expect(res.status).toBe(400);
  });

  // ── spell-mapped damage disciplines roll identical dice to their spell ────────

  const SPELL_MAPPED = [
    { discipline: "Gong of the Summit", spell: "Shatter" },
    { discipline: "Flames of the Phoenix", spell: "Fireball" },
    { discipline: "Breath of Winter", spell: "Cone of Cold" },
    { discipline: "River of Hungry Flame", spell: "Wall of Fire" },
  ];

  for (const m of SPELL_MAPPED) {
    it(`${m.discipline} rolls identical dice to ${m.spell} via a ki-scaled EffectSpec`, async () => {
      const [disc, spell] = await Promise.all([
        prisma.grantedAbility.findUnique({ where: { name: m.discipline } }),
        prisma.spell.findUnique({ where: { name: m.spell } }),
      ]);
      expect(disc).not.toBeNull();
      expect(spell).not.toBeNull();

      const effect = disciplineEffectSpec(disc!);
      expect(effect.effectType).toBe("damage");
      expect(effect.dice).toMatchObject({ count: spell!.effectDiceCount, faces: spell!.effectDiceFaces });
      expect(effect.damageType).toBe(spell!.damageType);
      expect(effect.scaling).toMatchObject({ mode: "ki" });
    });
  }
});

// Source discriminator: a non-discipline GrantedAbility row must not leak into
// the discipline picker or drive the discipline cast path.
describe("GrantedAbility source discriminator", () => {
  const SHADOW_NAME = "Test Shadow Arts Ability #437";
  const SHADOW_CLASS = "Disc Source Test Monk";
  const SHADOW_FIXTURE_ID = "test-disc-source-monk-1";
  let shadowId: string;
  let sourceClassId: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: SHADOW_CLASS },
      create: { name: SHADOW_CLASS, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics", "stealth"], isSpellcaster: false },
      update: {},
    });
    sourceClassId = cls.id;
    const row = await prisma.grantedAbility.upsert({
      where: { name: SHADOW_NAME },
      create: { name: SHADOW_NAME, description: "A future shadow-arts ability.", source: "shadowArts", minLevel: 3 },
      update: { source: "shadowArts", minLevel: 3 },
    });
    shadowId = row.id;
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: SHADOW_FIXTURE_ID } });
    await prisma.grantedAbility.deleteMany({ where: { name: SHADOW_NAME } });
    await prisma.characterClass.deleteMany({ where: { name: SHADOW_CLASS } });
  });

  it("excludes non-discipline rows from GET /api/disciplines", async () => {
    const res = await agent().get("/api/disciplines");
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).some((d) => d.id === shadowId)).toBe(false);
  });

  it("rejects castDiscipline against a non-discipline id", async () => {
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: SHADOW_FIXTURE_ID,
        experiencePoints: XP_L3,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: {
          create: [{ name: "monk", subclass: "way of the four elements", classId: sourceClassId, position: 0 }],
        },
      },
    });
    const res = await agent()
      .post(`/api/characters/${SHADOW_FIXTURE_ID}/disciplines/transactions`)
      .send({ operations: [{ type: "castDiscipline", disciplineId: shadowId, kiSpent: 2, roll: 10 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found in catalog/);
  });
});
