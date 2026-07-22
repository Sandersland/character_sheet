/**
 * Spellcasting route integration tests.
 * Mirrors inventory.test.ts: real Postgres in beforeEach, supertest against
 * createApp(). The fixture is a level-1 Wizard (2× L1 slots, INT 16).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-spellcasting";
let COOKIE: string;

// ── Catalog fixtures ─────────────────────────────────────────────────────────

const TEST_SPELL = {
  name: "Spellcasting Test Fireball",
  level: 3,
  school: "evocation" as const,
  castingTime: "1 action",
  range: "150 ft",
  duration: "Instantaneous",
  description: "8d6 fire damage.",
  effectKind: "damage",
  effectDiceCount: 8,
  effectDiceFaces: 6,
  damageType: "fire",
  attackType: "save",
  saveAbility: "dexterity",
  upcastDicePerLevel: 1,
  classes: ["wizard"],
};

const TEST_CANTRIP = {
  name: "Spellcasting Test Fire Bolt",
  level: 0,
  school: "evocation" as const,
  castingTime: "1 action",
  range: "120 ft",
  duration: "Instantaneous",
  description: "1d10 fire damage.",
  effectKind: "damage",
  effectDiceCount: 1,
  effectDiceFaces: 10,
  damageType: "fire",
  attackType: "attack",
  cantripScaling: true,
  classes: ["wizard"],
};

// ── Character fixture ─────────────────────────────────────────────────────────
// Level 1 Wizard (0 XP → 2× L1 spell slots derived at read time).
// INT 16 → modifier +3 → spellSaveDC = 8+2+3 = 13, spellAttackBonus = 5.

const FIXTURE_ID = "test-spellcasting-character-1";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Spellcasting Test Wizard",
  alignment: "Neutral Good",
  experiencePoints: 0,      // level 1 → 2 L1 slots
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 8, max: 8, temp: 0 },
  hitDice: { total: 1, die: "d6" },
  abilityScores: {
    strength: 8,
    dexterity: 12,
    constitution: 12,
    intelligence: 16,       // +3 modifier
    wisdom: 10,
    charisma: 10,
  },
  savingThrowProficiencies: ["intelligence", "wisdom"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
};

// Pre-seeded spells in the character's spellbook (compact format).
// These don't reference catalog IDs so they work without the catalog.
const FIXTURE_SPELLCASTING_JSON = {
  slotsUsed: {},
  spells: [
    {
      id: "fixture-cantrip-1",
      name: "Fixture Fire Bolt",
      level: 0,
      school: "evocation",
      prepared: true,
      castingTime: "1 action",
      range: "120 ft",
      duration: "Instantaneous",
      description: "1d10 fire damage.",
      effectKind: "damage",
      effectDiceCount: 1,
      effectDiceFaces: 10,
      damageType: "fire",
      attackType: "attack",
      cantripScaling: true,
    },
    {
      id: "fixture-spell-1",
      name: "Fixture Magic Missile",
      level: 1,
      school: "evocation",
      prepared: true,
      castingTime: "1 action",
      range: "120 ft",
      duration: "Instantaneous",
      description: "3d4+3 force damage, auto-hits.",
      effectKind: "damage",
      effectDiceCount: 3,
      effectDiceFaces: 4,
      effectModifier: 3,
      damageType: "force",
      upcastDicePerLevel: 1,
    },
    {
      id: "fixture-conc-1",
      name: "Fixture Bless",
      level: 1,
      school: "enchantment",
      prepared: true,
      castingTime: "1 action",
      range: "30 ft",
      duration: "Concentration, up to 1 minute",
      description: "Bless up to three creatures.",
      concentration: true,
    },
    {
      id: "fixture-conc-2",
      name: "Fixture Shield of Faith",
      level: 1,
      school: "abjuration",
      prepared: true,
      castingTime: "1 bonus action",
      range: "60 ft",
      duration: "Concentration, up to 10 minutes",
      description: "+2 AC to one creature.",
      concentration: true,
    },
  ],
};

describe("POST /api/characters/:id/spellcasting/transactions", () => {
  let wizardClassId: string;
  let catalogSpellId: string;

  // Use a unique class name that doesn't conflict with the seeded "Wizard" class
  // used by characters.test.ts. The CharacterClassEntry *snapshot* name (stored
  // as "wizard") is what deriveSpellcasting reads, so the catalog class can have
  // any unique name as long as we set the entry's name field correctly below.
  const WIZARD_CATALOG_NAME = "Spellcasting Route Test Wizard";

  afterAll(async () => {
    await prisma.spell.deleteMany({ where: { name: { in: [TEST_SPELL.name, TEST_CANTRIP.name] } } });
    await prisma.characterClass.deleteMany({ where: { name: WIZARD_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    // Upsert a uniquely-named wizard class for this test suite.
    const cls = await prisma.characterClass.upsert({
      where: { name: WIZARD_CATALOG_NAME },
      create: {
        name: WIZARD_CATALOG_NAME,
        hitDie: "d6",
        savingThrows: ["intelligence", "wisdom"],
        skillChoiceCount: 2,
        skillChoices: ["arcana", "history"],
        isSpellcaster: true,
      },
      update: {},
    });
    wizardClassId = cls.id;

    // Upsert catalog spells for learnSpell-from-catalog tests.
    const catalogSpell = await prisma.spell.upsert({
      where: { name: TEST_SPELL.name },
      create: TEST_SPELL,
      update: TEST_SPELL,
    });
    catalogSpellId = catalogSpell.id;
    await prisma.spell.upsert({
      where: { name: TEST_CANTRIP.name },
      create: TEST_CANTRIP,
      update: TEST_CANTRIP,
    });

    // Create the fixture character. The class entry's `name` snapshot is "wizard"
    // (lowercase) — that's what deriveSpellcasting reads to look up the caster type.
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        ownerId: OWNER_ID,
        spellcasting: FIXTURE_SPELLCASTING_JSON as Prisma.InputJsonValue,
        classEntries: {
          create: [{ name: "wizard", classId: wizardClassId, position: 0 }],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  // ── 404 / 400 guards ──────────────────────────────────────────────────────

  it("404s for an unknown character", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post("/api/characters/does-not-exist/spellcasting/transactions")
      .send({ operations: [{ type: "expendSlot", level: 1 }] });
    expect(res.status).toBe(404);
  });

  it("400s on a malformed body (invalid op type)", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "notARealType" }] });
    expect(res.status).toBe(400);
  });

  it("400s on a missing required field (castSpell without entryId)", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "castSpell", roll: 10 }] });
    expect(res.status).toBe(400);
  });

  // ── castSpell ─────────────────────────────────────────────────────────────

  it("casting a cantrip rolls (non-zero total expected) and does NOT expend a slot", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "castSpell", entryId: "fixture-cantrip-1", roll: 7 }] });

    expect(res.status).toBe(200);
    // Cantrip: no slots should have been used.
    const slots = res.body.spellcasting.slots as Array<{ level: number; used: number }>;
    slots.forEach((s) => expect(s.used).toBe(0));
  });

  it("casting a leveled spell expends a slot at that level", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 14 }] });

    expect(res.status).toBe(200);
    const slot1 = (res.body.spellcasting.slots as Array<{ level: number; used: number; total: number }>)
      .find((s) => s.level === 1);
    expect(slot1).toBeDefined();
    expect(slot1!.used).toBe(1);
    expect(slot1!.total).toBe(2); // level-1 wizard has 2 L1 slots
  });

  it("400s when casting a leveled spell with all slots of that level exhausted", async () => {
    const app = createApp();
    const url = `/api/characters/${FIXTURE_ID}/spellcasting/transactions`;

    // Use both L1 slots.
    await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 10 }] });
    await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 12 }] });

    // Third cast should fail.
    const res = await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 9 }] });
    expect(res.status).toBe(400);
  });

  it("400s when casting a spell with a slot level below the spell's level", async () => {
    // Level 1 wizard has no L0 slots for leveled spells — only L1.
    // We'll test an invalid pairing by using a high-level spell with a low slot.
    // fixture-spell-1 is level 1, but slotLevel: 0 is invalid (must be >= spell.level).
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 0, roll: 5 }] });
    expect(res.status).toBe(400);
  });

  // ── expendSlot / restoreSlot ──────────────────────────────────────────────

  it("expendSlot decrements available slots, restoreSlot increments them back", async () => {
    const app = createApp();
    const url = `/api/characters/${FIXTURE_ID}/spellcasting/transactions`;

    const expend = await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "expendSlot", level: 1 }] });
    expect(expend.status).toBe(200);
    const afterExpend = expend.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(afterExpend.used).toBe(1);

    const restore = await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "restoreSlot", level: 1 }] });
    expect(restore.status).toBe(200);
    const afterRestore = restore.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(afterRestore.used).toBe(0);
  });

  it("400s on restoreSlot when no slots of that level are used", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "restoreSlot", level: 1 }] });
    expect(res.status).toBe(400);
  });

  it("400s on expendSlot for a level the character doesn't have (level 9 for a L1 wizard)", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "expendSlot", level: 9 }] });
    expect(res.status).toBe(400);
  });

  // ── learnSpell ────────────────────────────────────────────────────────────

  it("learnSpell from catalog snapshots the spell into spells[]", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "learnSpell", spellId: catalogSpellId }] });

    expect(res.status).toBe(200);
    const spells = res.body.spellcasting.spells as Array<{ name: string; spellId: string; level: number; prepared: boolean }>;
    const learned = spells.find((s) => s.spellId === catalogSpellId);
    expect(learned).toBeDefined();
    expect(learned!.name).toBe(TEST_SPELL.name);
    expect(learned!.level).toBe(3);
    expect(learned!.prepared).toBe(false);
  });

  it("learnSpell with a custom payload creates a spell without a spellId", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({
        operations: [{
          type: "learnSpell",
          custom: {
            name: "Homebrew Zap",
            level: 1,
            school: "evocation",
            castingTime: "1 action",
            range: "30 ft",
            duration: "Instantaneous",
            description: "Zap something.",
          },
        }],
      });

    expect(res.status).toBe(200);
    const spells = res.body.spellcasting.spells as Array<{ name: string; spellId?: string }>;
    const learned = spells.find((s) => s.name === "Homebrew Zap");
    expect(learned).toBeDefined();
    expect(learned!.spellId).toBeUndefined();
  });

  it("400s on learnSpell when both spellId and custom are provided", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({
        operations: [{
          type: "learnSpell",
          spellId: catalogSpellId,
          custom: { name: "Overlap", level: 0, school: "evocation", castingTime: "1 action", range: "Self", duration: "Instantaneous", description: "Oops." },
        }],
      });
    expect(res.status).toBe(400);
  });

  it("400s on duplicate learnSpell (same spellId twice)", async () => {
    const app = createApp();
    const url = `/api/characters/${FIXTURE_ID}/spellcasting/transactions`;

    await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "learnSpell", spellId: catalogSpellId }] });
    const dup = await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "learnSpell", spellId: catalogSpellId }] });
    expect(dup.status).toBe(400);
  });

  // ── forgetSpell ───────────────────────────────────────────────────────────

  it("forgetSpell removes the spell from spells[]", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "forgetSpell", entryId: "fixture-cantrip-1" }] });

    expect(res.status).toBe(200);
    const spells = res.body.spellcasting.spells as Array<{ id: string }>;
    expect(spells.find((s) => s.id === "fixture-cantrip-1")).toBeUndefined();
  });

  it("400s on forgetSpell for a non-existent entryId", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "forgetSpell", entryId: "does-not-exist" }] });
    expect(res.status).toBe(400);
  });

  // ── prepareSpell / unprepareSpell ─────────────────────────────────────────

  it("prepareSpell / unprepareSpell toggles prepared on a leveled spell", async () => {
    const app = createApp();
    const url = `/api/characters/${FIXTURE_ID}/spellcasting/transactions`;

    // fixture-spell-1 starts prepared=true; unprepare it.
    const unprep = await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "unprepareSpell", entryId: "fixture-spell-1" }] });
    expect(unprep.status).toBe(200);
    const afterUnprep = (unprep.body.spellcasting.spells as Array<{ id: string; prepared: boolean }>)
      .find((s) => s.id === "fixture-spell-1");
    expect(afterUnprep!.prepared).toBe(false);

    // Prepare it again.
    const prep = await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "prepareSpell", entryId: "fixture-spell-1" }] });
    expect(prep.status).toBe(200);
    const afterPrep = (prep.body.spellcasting.spells as Array<{ id: string; prepared: boolean }>)
      .find((s) => s.id === "fixture-spell-1");
    expect(afterPrep!.prepared).toBe(true);
  });

  it("400s on prepareSpell for a cantrip (always prepared, no toggle)", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "prepareSpell", entryId: "fixture-cantrip-1" }] });
    expect(res.status).toBe(400);
  });

  // ── Atomicity ─────────────────────────────────────────────────────────────

  it("a multi-op batch is atomic: a later failing op rolls back an earlier valid one", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({
        operations: [
          { type: "expendSlot", level: 1 },               // valid
          { type: "forgetSpell", entryId: "not-a-real-entry" }, // invalid — should roll back the expendSlot
        ],
      });

    expect(res.status).toBe(400);

    // Verify the character is unchanged.
    const char = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    const slot1 = char.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slot1.used).toBe(0); // rolled back
  });

  // ── castSpell self-apply (target: self) ───────────────────────────────────

  it("castSpell with apply:{self,damage} subtracts HP and expends the slot in one batch", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({
        operations: [{
          type: "castSpell",
          entryId: "fixture-spell-1",
          slotLevel: 1,
          roll: 4,
          apply: { target: "self", kind: "damage", amount: 4 },
        }],
      });

    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(4); // 8 → 4
    const slot1 = res.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slot1.used).toBe(1);
  });

  it("castSpell with apply:{self,heal} restores HP (after taking damage)", async () => {
    const app = createApp();
    const url = `/api/characters/${FIXTURE_ID}/spellcasting/transactions`;

    // Take 5 self-damage first (8 → 3).
    await supertest.agent(app).set("Cookie", COOKIE).post(url).send({
      operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 5, apply: { target: "self", kind: "damage", amount: 5 } }],
    });

    // Heal 3 (3 → 6).
    const heal = await supertest.agent(app).set("Cookie", COOKIE).post(url).send({
      operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 3, apply: { target: "self", kind: "heal", amount: 3 } }],
    });
    expect(heal.status).toBe(200);
    expect(heal.body.hitPoints.current).toBe(6);
  });

  it("self-damage clamps at 0 HP", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({
        operations: [{ type: "castSpell", entryId: "fixture-cantrip-1", roll: 100, apply: { target: "self", kind: "damage", amount: 100 } }],
      });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(0);
  });

  it("a failing later op rolls back BOTH the slot spend and the self-HP change", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({
        operations: [
          { type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 4, apply: { target: "self", kind: "damage", amount: 4 } },
          { type: "forgetSpell", entryId: "not-a-real-entry" }, // invalid — rolls back the cast + HP
        ],
      });
    expect(res.status).toBe(400);

    const char = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
    expect(char.body.hitPoints.current).toBe(8); // HP unchanged
    const slot1 = char.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slot1.used).toBe(0); // slot unchanged
  });

  // ── Derived stats ─────────────────────────────────────────────────────────

  it("returns correct derived spellSaveDC and spellAttackBonus for a L1 INT-16 Wizard", async () => {
    // No op needed — just read back the character via an expendSlot (or we could
    // do a GET, but the route returns the full character on every mutating response).
    // Use a GET instead to avoid touching state.
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);

    expect(res.status).toBe(200);
    // L1 proficiency bonus = 2; INT mod = +3. DC = 8+2+3 = 13. Attack = 2+3 = 5.
    expect(res.body.spellcasting.spellSaveDC).toBe(13);
    expect(res.body.spellcasting.spellAttackBonus).toBe(5);
    expect(res.body.spellcasting.ability).toBe("intelligence");
  });

  // ── Concentration enforcement ──────────────────────────────────────────────
  // Reuses the L1 Wizard fixture above (which now also knows two concentration
  // spells: fixture-conc-1 "Fixture Bless" and fixture-conc-2 "Fixture Shield of
  // Faith", both L1 so they fit in the wizard's two L1 slots).

  describe("concentration", () => {
    const hpUrl = `/api/characters/${FIXTURE_ID}/hp`;

    it("casting a concentration spell sets active concentration", async () => {
      const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
        .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
        .send({ operations: [{ type: "castSpell", entryId: "fixture-conc-1", slotLevel: 1, roll: 0 }] });

      expect(res.status).toBe(200);
      expect(res.body.spellcasting.concentratingOn).toEqual({
        entryId: "fixture-conc-1",
        spellName: "Fixture Bless",
      });
    });

    it("casting a non-concentration spell does not start concentration", async () => {
      const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
        .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
        .send({ operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 9 }] });

      expect(res.status).toBe(200);
      expect(res.body.spellcasting.concentratingOn ?? null).toBeNull();
    });

    it("casting a second concentration spell drops the first and logs it", async () => {
      const app = createApp();
      const url = `/api/characters/${FIXTURE_ID}/spellcasting/transactions`;
      await supertest.agent(app).set("Cookie", COOKIE)
        .post(url)
        .send({ operations: [{ type: "castSpell", entryId: "fixture-conc-1", slotLevel: 1, roll: 0 }] });

      const res = await supertest.agent(app).set("Cookie", COOKIE)
        .post(url)
        .send({ operations: [{ type: "castSpell", entryId: "fixture-conc-2", slotLevel: 1, roll: 0 }] });

      expect(res.status).toBe(200);
      expect(res.body.spellcasting.concentratingOn).toEqual({
        entryId: "fixture-conc-2",
        spellName: "Fixture Shield of Faith",
      });

      const activity = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}/activity`);
      const dropEvents = (activity.body as Array<{ type: string; summary: string }>).filter(
        (e) => e.type === "concentrationDropped",
      );
      expect(dropEvents.length).toBe(1);
      expect(dropEvents[0].summary).toContain("Fixture Bless");
    });

    it("re-casting the same concentration spell keeps it concentrated (no spurious drop)", async () => {
      const app = createApp();
      const url = `/api/characters/${FIXTURE_ID}/spellcasting/transactions`;
      await supertest.agent(app).set("Cookie", COOKIE)
        .post(url)
        .send({ operations: [{ type: "castSpell", entryId: "fixture-conc-1", slotLevel: 1, roll: 0 }] });
      const res = await supertest.agent(app).set("Cookie", COOKIE)
        .post(url)
        .send({ operations: [{ type: "castSpell", entryId: "fixture-conc-1", slotLevel: 1, roll: 0 }] });

      expect(res.status).toBe(200);
      expect(res.body.spellcasting.concentratingOn).toEqual({
        entryId: "fixture-conc-1",
        spellName: "Fixture Bless",
      });
      const activity = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}/activity`);
      const dropEvents = (activity.body as Array<{ type: string }>).filter(
        (e) => e.type === "concentrationDropped",
      );
      expect(dropEvents.length).toBe(0);
    });

    it("dropConcentration op clears active concentration", async () => {
      const app = createApp();
      const url = `/api/characters/${FIXTURE_ID}/spellcasting/transactions`;
      await supertest.agent(app).set("Cookie", COOKIE)
        .post(url)
        .send({ operations: [{ type: "castSpell", entryId: "fixture-conc-1", slotLevel: 1, roll: 0 }] });

      const res = await supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "dropConcentration" }] });
      expect(res.status).toBe(200);
      expect(res.body.spellcasting.concentratingOn ?? null).toBeNull();
    });

    it("dropConcentration with nothing concentrated is a no-op", async () => {
      const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
        .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
        .send({ operations: [{ type: "dropConcentration" }] });
      expect(res.status).toBe(200);
      expect(res.body.spellcasting.concentratingOn ?? null).toBeNull();
    });

    it("forgetting the concentrated spell clears concentration", async () => {
      const app = createApp();
      const url = `/api/characters/${FIXTURE_ID}/spellcasting/transactions`;
      await supertest.agent(app).set("Cookie", COOKIE)
        .post(url)
        .send({ operations: [{ type: "castSpell", entryId: "fixture-conc-1", slotLevel: 1, roll: 0 }] });

      const res = await supertest.agent(app).set("Cookie", COOKIE)
        .post(url)
        .send({ operations: [{ type: "forgetSpell", entryId: "fixture-conc-1" }] });
      expect(res.status).toBe(200);
      expect(res.body.spellcasting.concentratingOn ?? null).toBeNull();
    });

    it("a long rest clears active concentration", async () => {
      const app = createApp();
      await supertest.agent(app).set("Cookie", COOKIE)
        .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
        .send({ operations: [{ type: "castSpell", entryId: "fixture-conc-1", slotLevel: 1, roll: 0 }] });

      const rest = await supertest.agent(app).set("Cookie", COOKIE).post(hpUrl).send({ operations: [{ type: "longRest" }] });
      expect(rest.status).toBe(200);
      expect(rest.body.spellcasting.concentratingOn ?? null).toBeNull();
    });

    it("undo restores concentration dropped by casting a second spell", async () => {
      const app = createApp();
      const url = `/api/characters/${FIXTURE_ID}/spellcasting/transactions`;
      await supertest.agent(app).set("Cookie", COOKIE)
        .post(url)
        .send({ operations: [{ type: "castSpell", entryId: "fixture-conc-1", slotLevel: 1, roll: 0 }] });
      // Casting the second spell drops the first (this batch holds two events:
      // concentrationDropped + castSpell).
      await supertest.agent(app).set("Cookie", COOKIE)
        .post(url)
        .send({ operations: [{ type: "castSpell", entryId: "fixture-conc-2", slotLevel: 1, roll: 0 }] });

      // Undo the most recent batch (the second cast). Revert is LIFO + keyed by
      // batchId; the full spellcasting JSON is restored from the before-snapshot.
      const activity = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}/activity`);
      const events = activity.body as Array<{ type: string; reverted: boolean; batchId?: string }>;
      const latestCast = events.find((e) => e.type === "castSpell" && !e.reverted)!;
      const undo = await supertest.agent(app).set("Cookie", COOKIE)
        .post(`/api/characters/${FIXTURE_ID}/events/${latestCast.batchId}/revert`);
      expect(undo.status).toBe(200);
      expect(undo.body.spellcasting.concentratingOn).toEqual({
        entryId: "fixture-conc-1",
        spellName: "Fixture Bless",
      });
    });
  });
});

// ── Subclass-granted spells (derived, non-persisted) ──────────────────────────
// A Warrior of Shadow monk gains Minor Illusion at level 3 as a pure-derived grant.
// The monk is a non-caster, so the whole spellcasting view exists only because
// of the grant (slotless Wisdom view).

const MONK_ID = "test-monk-shadow-1";

describe("subclass-granted spells", () => {
  const MONK_CATALOG_NAME = "Spellcasting Route Test Monk";
  let monkClassId: string;

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: MONK_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: MONK_CATALOG_NAME },
      create: {
        name: MONK_CATALOG_NAME, hitDie: "d8",
        savingThrows: ["strength", "dexterity"], skillChoiceCount: 2,
        skillChoices: ["acrobatics", "stealth"], isSpellcaster: false, subclassLevel: 3,
      },
      update: {},
    });
    monkClassId = cls.id;

    // Warrior of Shadow grants Minor Illusion at L3 as data (#898): a catalog Subclass
    // row under this test class + a SubclassGrantedSpell → the seeded Minor Illusion.
    // Warrior of the Open Hand exists as a catalog row but grants nothing.
    const shadow = await prisma.subclass.upsert({
      where: { classId_name: { classId: monkClassId, name: "Warrior of Shadow" } },
      create: { classId: monkClassId, name: "Warrior of Shadow", description: "Test subclass" },
      update: {},
    });
    await prisma.subclass.upsert({
      where: { classId_name: { classId: monkClassId, name: "Warrior of the Open Hand" } },
      create: { classId: monkClassId, name: "Warrior of the Open Hand", description: "Test subclass" },
      update: {},
    });
    const minorIllusion = await prisma.spell.findUnique({ where: { name: "Minor Illusion" }, select: { id: true } });
    if (!minorIllusion) throw new Error("Minor Illusion not seeded — run `prisma db seed` before tests");
    await prisma.subclassGrantedSpell.upsert({
      where: { subclassId_spellId: { subclassId: shadow.id, spellId: minorIllusion.id } },
      create: { subclassId: shadow.id, spellId: minorIllusion.id, gateLevel: 3, castingAbility: "wisdom" },
      update: { gateLevel: 3, castingAbility: "wisdom" },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: MONK_ID } });
  });

  const createMonk = async (opts: { xp: number; subclass: string | null; spells?: unknown[] }) => {
    // Link the subclass FK (#898): granted spells resolve off subclassId, mirroring
    // what setSubclass / creation write in production.
    const subclassId = opts.subclass
      ? (
          await prisma.subclass.findUnique({
            where: { classId_name: { classId: monkClassId, name: opts.subclass } },
            select: { id: true },
          })
        )?.id
      : undefined;
    await prisma.character.create({
      data: {
        id: MONK_ID,
        name: "Shadow Monk",
        alignment: "Lawful Neutral",
        experiencePoints: opts.xp,
        initiativeBonus: 2,
        speed: 30,
        hitPoints: { current: 20, max: 20, temp: 0 },
        hitDice: { total: 3, die: "d8" },
        abilityScores: {
          strength: 10, dexterity: 16, constitution: 12,
          intelligence: 10, wisdom: 15, charisma: 8,
        },
        savingThrowProficiencies: ["strength", "dexterity"],
        skills: [], toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        ownerId: OWNER_ID,
        spellcasting: { slotsUsed: {}, spells: opts.spells ?? [] } as Prisma.InputJsonValue,
        classEntries: {
          create: [
            { name: "monk", classId: monkClassId, position: 0, subclass: opts.subclass ?? undefined, subclassId },
          ],
        },
      },
    });
  };

  const getSpells = (body: { spellcasting?: { spells?: Array<{ name: string; source?: string }> } }) =>
    body.spellcasting?.spells ?? [];

  it("grants Minor Illusion to a Warrior of Shadow monk at level 3", async () => {
    await createMonk({ xp: 900, subclass: "Warrior of Shadow" }); // L3
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${MONK_ID}`);
    expect(res.status).toBe(200);
    const minor = getSpells(res.body).find((s) => s.name === "Minor Illusion");
    expect(minor).toBeDefined();
    expect(minor!.source).toBe("subclass");
  });

  it("surfaces the granted view's casting ability + derived DC from that ability", async () => {
    await createMonk({ xp: 900, subclass: "Warrior of Shadow" }); // L3, WIS 15 (+2), prof +2
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${MONK_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.ability).toBe("wisdom");
    expect(res.body.spellcasting.spellSaveDC).toBe(12);
    expect(res.body.spellcasting.spellAttackBonus).toBe(4);
  });

  it("does NOT grant Minor Illusion below level 3", async () => {
    await createMonk({ xp: 300, subclass: "Warrior of Shadow" }); // L2
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${MONK_ID}`);
    expect(getSpells(res.body).find((s) => s.name === "Minor Illusion")).toBeUndefined();
  });

  it("does NOT grant Minor Illusion to a different subclass", async () => {
    await createMonk({ xp: 900, subclass: "Warrior of the Open Hand" }); // L3
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${MONK_ID}`);
    expect(getSpells(res.body).find((s) => s.name === "Minor Illusion")).toBeUndefined();
  });

  it("does not duplicate Minor Illusion when the player also learned it (learned copy wins)", async () => {
    await createMonk({
      xp: 900,
      subclass: "Warrior of Shadow",
      spells: [{
        id: "learned-minor-illusion", name: "Minor Illusion", level: 0, school: "illusion",
        prepared: true, castingTime: "1 action", range: "30 ft", duration: "1 minute",
        description: "Learned copy.",
      }],
    });
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${MONK_ID}`);
    const matches = getSpells(res.body).filter((s) => s.name === "Minor Illusion");
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBeUndefined(); // the learned entry, not the grant
  });

  it("400s when trying to forget a subclass-granted spell", async () => {
    await createMonk({ xp: 900, subclass: "Warrior of Shadow" });
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${MONK_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "forgetSpell", entryId: "granted:warrior-of-shadow:minor-illusion" }] });
    expect(res.status).toBe(400);
  });

  it("casting a granted cantrip logs the cast but persists no granted entry", async () => {
    await createMonk({ xp: 900, subclass: "Warrior of Shadow" });
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${MONK_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "castSpell", entryId: "granted:warrior-of-shadow:minor-illusion", roll: 0 }] });
    expect(res.status).toBe(200);

    // The response view still surfaces the re-derived grant.
    const minor = getSpells(res.body).find((s) => s.name === "Minor Illusion");
    expect(minor!.source).toBe("subclass");

    // Nothing with a granted id / subclass source was persisted.
    const row = await prisma.character.findUnique({ where: { id: MONK_ID }, select: { spellcasting: true } });
    const stored = row?.spellcasting as { spells: Array<{ id: string; source?: string }> } | null;
    expect(stored?.spells.some((s) => s.source === "subclass" || s.id.startsWith("granted:"))).toBe(false);

    // A castSpell event was logged.
    const activity = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${MONK_ID}/activity`);
    const castEv = (activity.body as Array<{ type: string }>).find((e) => e.type === "castSpell");
    expect(castEv).toBeDefined();
  });
});

// ── Warlock Pact Magic + Mystic Arcanum ───────────────────────────────────────
// Level-11 Warlock: 3 Pact slots at level 5, plus a 6th-level Mystic Arcanum
// charge (1/long rest). Exercises arcanum cast routing and rest recharge.

const WARLOCK_ID = "test-warlock-character-1";

const WARLOCK_BASE = {
  id: WARLOCK_ID,
  name: "Mystic Arcanum Test Warlock",
  alignment: "Chaotic Neutral",
  experiencePoints: 85000, // level 11
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 60, max: 60, temp: 0 },
  hitDice: { total: 11, die: "d8" },
  abilityScores: {
    strength: 10, dexterity: 12, constitution: 14,
    intelligence: 10, wisdom: 10, charisma: 18, // CHA +4
  },
  savingThrowProficiencies: ["wisdom", "charisma"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
};

// A 5th-level Pact spell and a 6th-level Mystic Arcanum spell in the spellbook.
const WARLOCK_SPELLCASTING_JSON = {
  slotsUsed: {},
  arcanumUsed: {},
  spells: [
    {
      id: "pact-spell-5", name: "Fixture Synaptic Static", level: 5, school: "enchantment",
      prepared: true, castingTime: "1 action", range: "120 ft", duration: "Instantaneous",
      description: "8d6 psychic.", effectKind: "damage", effectDiceCount: 8, effectDiceFaces: 6,
      damageType: "psychic", attackType: "save", saveAbility: "intelligence",
    },
    {
      id: "arcanum-spell-6", name: "Fixture Eyebite", level: 6, school: "necromancy",
      prepared: true, castingTime: "1 action", range: "60 ft", duration: "1 minute",
      description: "A creature is frightened/sickened/asleep.",
    },
  ],
};

describe("Warlock Pact Magic + Mystic Arcanum", () => {
  const WARLOCK_CATALOG_NAME = "Spellcasting Route Test Warlock";

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: WARLOCK_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: WARLOCK_CATALOG_NAME },
      create: {
        name: WARLOCK_CATALOG_NAME, hitDie: "d8",
        savingThrows: ["wisdom", "charisma"], skillChoiceCount: 2,
        skillChoices: ["arcana", "deception"], isSpellcaster: true,
      },
      update: {},
    });
    await prisma.character.create({
      data: {
        ...WARLOCK_BASE,
        ownerId: OWNER_ID,
        spellcasting: WARLOCK_SPELLCASTING_JSON as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "warlock", classId: cls.id, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: WARLOCK_ID } });
  });

  const castUrl = `/api/characters/${WARLOCK_ID}/spellcasting/transactions`;
  const hpUrl = `/api/characters/${WARLOCK_ID}/hp`;

  it("derives 3 Pact slots at level 5 and a 6th-level Mystic Arcanum charge", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${WARLOCK_ID}`);
    expect(res.status).toBe(200);
    const slots = res.body.spellcasting.slots as Array<{ level: number; total: number }>;
    expect(slots).toEqual([{ level: 5, total: 3, used: 0 }]);
    expect(res.body.spellcasting.arcana).toEqual([{ level: 6, total: 1, used: 0 }]);
    // CHA +4, L11 prof +4 → DC = 8+4+4 = 16.
    expect(res.body.spellcasting.spellSaveDC).toBe(16);
    expect(res.body.spellcasting.ability).toBe("charisma");
  });

  it("casts a 6th-level spell via the Mystic Arcanum charge, not a Pact slot", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(castUrl)
      .send({ operations: [{ type: "castSpell", entryId: "arcanum-spell-6", slotLevel: 6, roll: 0 }] });
    expect(res.status).toBe(200);
    const arcanum6 = res.body.spellcasting.arcana.find((a: { level: number }) => a.level === 6);
    expect(arcanum6.used).toBe(1);
    const pact = res.body.spellcasting.slots.find((s: { level: number }) => s.level === 5);
    expect(pact.used).toBe(0); // no Pact slot consumed
  });

  it("rejects a second arcanum cast of the same level until a long rest", async () => {
    const app = createApp();
    await supertest.agent(app).set("Cookie", COOKIE).post(castUrl).send({ operations: [{ type: "castSpell", entryId: "arcanum-spell-6", slotLevel: 6, roll: 0 }] });
    const res = await supertest.agent(app).set("Cookie", COOKIE).post(castUrl).send({ operations: [{ type: "castSpell", entryId: "arcanum-spell-6", slotLevel: 6, roll: 0 }] });
    expect(res.status).toBe(400);
  });

  it("recharges Pact slots on a short rest but NOT Mystic Arcanum", async () => {
    const app = createApp();
    // Spend a Pact slot (5th) and the 6th-level arcanum.
    await supertest.agent(app).set("Cookie", COOKIE).post(castUrl).send({ operations: [{ type: "castSpell", entryId: "pact-spell-5", slotLevel: 5, roll: 12 }] });
    await supertest.agent(app).set("Cookie", COOKIE).post(castUrl).send({ operations: [{ type: "castSpell", entryId: "arcanum-spell-6", slotLevel: 6, roll: 0 }] });

    const rest = await supertest.agent(app).set("Cookie", COOKIE).post(hpUrl).send({ operations: [{ type: "shortRest", rolls: [5] }] });
    expect(rest.status).toBe(200);
    const pact = rest.body.spellcasting.slots.find((s: { level: number }) => s.level === 5);
    expect(pact.used).toBe(0); // Pact slot recharged
    const arcanum6 = rest.body.spellcasting.arcana.find((a: { level: number }) => a.level === 6);
    expect(arcanum6.used).toBe(1); // arcanum still spent
  });

  it("recharges both Pact slots and Mystic Arcanum on a long rest", async () => {
    const app = createApp();
    await supertest.agent(app).set("Cookie", COOKIE).post(castUrl).send({ operations: [{ type: "castSpell", entryId: "pact-spell-5", slotLevel: 5, roll: 12 }] });
    await supertest.agent(app).set("Cookie", COOKIE).post(castUrl).send({ operations: [{ type: "castSpell", entryId: "arcanum-spell-6", slotLevel: 6, roll: 0 }] });

    const rest = await supertest.agent(app).set("Cookie", COOKIE).post(hpUrl).send({ operations: [{ type: "longRest" }] });
    expect(rest.status).toBe(200);
    const pact = rest.body.spellcasting.slots.find((s: { level: number }) => s.level === 5);
    expect(pact.used).toBe(0);
    const arcanum6 = rest.body.spellcasting.arcana.find((a: { level: number }) => a.level === 6);
    expect(arcanum6.used).toBe(0);
    // The known-spell list survives the long rest (regression guard).
    expect(rest.body.spellcasting.spells).toHaveLength(2);
  });
});

// ── Prepared-spell cap (#883) ────────────────────────────────────────────────

const PREPCAP_OWNER = "owner-prepcap";
const PREPCAP_WIZARD_ID = "test-prepcap-wizard-8";
const PREPCAP_SORCERER_ID = "test-prepcap-sorcerer-8";
const PREPCAP_STALE_ID = "test-prepcap-stale-level";
const PREPCAP_MULTI_ID = "test-prepcap-multi";

// N level-1 spells; the first `preparedCount` are prepared, the rest unprepared.
function leveledSpells(preparedCount: number, total: number) {
  return Array.from({ length: total }, (_, i) => ({
    id: `prep-${i + 1}`,
    name: `Fixture Prepared ${i + 1}`,
    level: 1,
    school: "evocation",
    prepared: i < preparedCount,
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "Placeholder.",
  }));
}

const PREPCAP_CANTRIP = {
  id: "prep-cantrip", name: "Fixture Prepared Cantrip", level: 0, school: "evocation",
  prepared: true, castingTime: "1 action", range: "60 ft", duration: "Instantaneous",
  description: "Cantrip.",
};

describe("prepared-spell cap enforcement (#883)", () => {
  let wizardClassId: string;
  let sorcererClassId: string;
  let clericClassId: string;
  const WIZARD_CATALOG = "PrepCap Wizard";
  const SORCERER_CATALOG = "PrepCap Sorcerer";
  const CLERIC_CATALOG = "PrepCap Cleric";

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: { in: [WIZARD_CATALOG, SORCERER_CATALOG, CLERIC_CATALOG] } } });
  });

  beforeEach(async () => {
    await ensureTestOwner(PREPCAP_OWNER);
    COOKIE = await authCookie(PREPCAP_OWNER);
    const wiz = await prisma.characterClass.upsert({
      where: { name: WIZARD_CATALOG },
      create: { name: WIZARD_CATALOG, hitDie: "d6", savingThrows: ["intelligence", "wisdom"], skillChoiceCount: 2, skillChoices: ["arcana"], isSpellcaster: true },
      update: {},
    });
    wizardClassId = wiz.id;
    const sorc = await prisma.characterClass.upsert({
      where: { name: SORCERER_CATALOG },
      create: { name: SORCERER_CATALOG, hitDie: "d6", savingThrows: ["constitution", "charisma"], skillChoiceCount: 2, skillChoices: ["arcana"], isSpellcaster: true },
      update: {},
    });
    sorcererClassId = sorc.id;
    const cler = await prisma.characterClass.upsert({
      where: { name: CLERIC_CATALOG },
      create: { name: CLERIC_CATALOG, hitDie: "d8", savingThrows: ["wisdom", "charisma"], skillChoiceCount: 2, skillChoices: ["religion"], isSpellcaster: true },
      update: {},
    });
    clericClassId = cler.id;

    // Wizard 8 / INT 18 → prepared limit 12. Seed 12 prepared + 1 unprepared + a cantrip.
    await prisma.character.create({
      data: {
        id: PREPCAP_WIZARD_ID, name: "PrepCap Wizard", alignment: "Neutral", ownerId: PREPCAP_OWNER,
        experiencePoints: 34000, initiativeBonus: 0, speed: 30,
        hitPoints: { current: 40, max: 40, temp: 0 }, hitDice: { total: 8, die: "d6" },
        abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 18, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: ["intelligence", "wisdom"], skills: [], toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        spellcasting: { slotsUsed: {}, spells: [...leveledSpells(12, 13), PREPCAP_CANTRIP] } as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "wizard", classId: wizardClassId, level: 8, position: 0 }] },
      },
    });

    // Sorcerer 8 → prepared caster (SRD 5.2 table = 12). Seed 20 "prepared" leveled + 1 unprepared (over cap).
    await prisma.character.create({
      data: {
        id: PREPCAP_SORCERER_ID, name: "PrepCap Sorcerer", alignment: "Neutral", ownerId: PREPCAP_OWNER,
        experiencePoints: 34000, initiativeBonus: 0, speed: 30,
        hitPoints: { current: 40, max: 40, temp: 0 }, hitDice: { total: 8, die: "d6" },
        abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 18 },
        savingThrowProficiencies: ["constitution", "charisma"], skills: [], toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        spellcasting: { slotsUsed: {}, spells: leveledSpells(20, 21) } as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "sorcerer", classId: sorcererClassId, level: 8, position: 0 }] },
      },
    });

    // Single-class Wizard with a STALE classEntry.level=1 but XP for level 8 (INT 18).
    // Enforcement must use the XP-derived level (limit 12), not the stale column (limit 6).
    await prisma.character.create({
      data: {
        id: PREPCAP_STALE_ID, name: "PrepCap Stale", alignment: "Neutral", ownerId: PREPCAP_OWNER,
        experiencePoints: 34000, initiativeBonus: 0, speed: 30,
        hitPoints: { current: 40, max: 40, temp: 0 }, hitDice: { total: 8, die: "d6" },
        abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 18, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: ["intelligence", "wisdom"], skills: [], toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        spellcasting: { slotsUsed: {}, spells: leveledSpells(8, 9) } as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "wizard", classId: wizardClassId, level: 1, position: 0 }] },
      },
    });

    // Multiclass Wizard 3 (SRD 5.2 table = 6) + Cleric 2 (table = 5) → combined prepared cap 11.
    await prisma.character.create({
      data: {
        id: PREPCAP_MULTI_ID, name: "PrepCap Multi", alignment: "Neutral", ownerId: PREPCAP_OWNER,
        experiencePoints: 6500, initiativeBonus: 0, speed: 30,
        hitPoints: { current: 30, max: 30, temp: 0 }, hitDice: { total: 5, die: "d6" },
        abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 12, charisma: 10 },
        savingThrowProficiencies: ["intelligence", "wisdom"], skills: [], toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        spellcasting: { slotsUsed: {}, spells: leveledSpells(11, 12) } as Prisma.InputJsonValue,
        classEntries: {
          create: [
            { name: "wizard", classId: wizardClassId, level: 3, position: 0 },
            { name: "cleric", classId: clericClassId, level: 2, position: 1 },
          ],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({
      where: { id: { in: [PREPCAP_WIZARD_ID, PREPCAP_SORCERER_ID, PREPCAP_STALE_ID, PREPCAP_MULTI_ID] } },
    });
  });

  const wizUrl = `/api/characters/${PREPCAP_WIZARD_ID}/spellcasting/transactions`;

  it("rejects preparing a 13th spell over the cap of 12", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).post(wizUrl)
      .send({ operations: [{ type: "prepareSpell", entryId: "prep-13" }] });
    expect(res.status).toBe(400);
    expect(res.body.error ?? JSON.stringify(res.body)).toMatch(/at most 12/);
  });

  it("unpreparing frees a slot so a new spell can then be prepared", async () => {
    const app = createApp();
    const free = await supertest.agent(app).set("Cookie", COOKIE).post(wizUrl)
      .send({ operations: [{ type: "unprepareSpell", entryId: "prep-1" }] });
    expect(free.status).toBe(200);
    const prep = await supertest.agent(app).set("Cookie", COOKIE).post(wizUrl)
      .send({ operations: [{ type: "prepareSpell", entryId: "prep-13" }] });
    expect(prep.status).toBe(200);
    expect(prep.body.spellcasting.preparedSpellCount).toBe(12);
  });

  it("cantrips are always prepared, rejected on toggle, and never count toward the cap", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).post(wizUrl)
      .send({ operations: [{ type: "prepareSpell", entryId: "prep-cantrip" }] });
    expect(res.status).toBe(400);
    const get = await supertest(createApp()).get(`/api/characters/${PREPCAP_WIZARD_ID}`).set("Cookie", COOKIE);
    expect(get.body.spellcasting.preparedSpellLimit).toBe(12);
    expect(get.body.spellcasting.preparedSpellCount).toBe(12);
  });

  it("sorcerer is now a prepared caster with a non-null cap (SRD 5.2) and is blocked over it", async () => {
    const url = `/api/characters/${PREPCAP_SORCERER_ID}/spellcasting/transactions`;
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).post(url)
      .send({ operations: [{ type: "prepareSpell", entryId: "prep-21" }] });
    expect(res.status).toBe(400);
    expect(res.body.error ?? JSON.stringify(res.body)).toMatch(/at most 12/);
    const get = await supertest(createApp()).get(`/api/characters/${PREPCAP_SORCERER_ID}`).set("Cookie", COOKIE);
    expect(get.body.spellcasting.preparedSpellLimit).toBe(12);
  });

  it("single-class enforcement uses the XP-derived level, not a stale classEntry.level", async () => {
    // Stale column would cap at 6 (already exceeded); the XP-derived cap is 12, so
    // a 9th prepared spell must be accepted and the limit reported as 12.
    const url = `/api/characters/${PREPCAP_STALE_ID}/spellcasting/transactions`;
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).post(url)
      .send({ operations: [{ type: "prepareSpell", entryId: "prep-9" }] });
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.preparedSpellLimit).toBe(12);
    expect(res.body.spellcasting.preparedSpellCount).toBe(9);
  });

  it("multiclass prepared caster is rejected at the combined cap", async () => {
    const url = `/api/characters/${PREPCAP_MULTI_ID}/spellcasting/transactions`;
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).post(url)
      .send({ operations: [{ type: "prepareSpell", entryId: "prep-12" }] });
    expect(res.status).toBe(400);
    expect(res.body.error ?? JSON.stringify(res.body)).toMatch(/at most 11/);
    const get = await supertest(createApp()).get(`/api/characters/${PREPCAP_MULTI_ID}`).set("Cookie", COOKIE);
    expect(get.body.spellcasting.preparedSpellLimit).toBe(11);
  });
});
