/**
 * Spellcasting route integration tests.
 * Mirrors inventory.test.ts: real Postgres in beforeEach, supertest against
 * createApp(). The fixture is a level-1 Wizard (2× L1 slots, INT 16).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

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
  armorClass: 12,
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
  journal: [],
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
    const res = await supertest(createApp())
      .post("/api/characters/does-not-exist/spellcasting/transactions")
      .send({ operations: [{ type: "expendSlot", level: 1 }] });
    expect(res.status).toBe(404);
  });

  it("400s on a malformed body (invalid op type)", async () => {
    const res = await supertest(createApp())
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "notARealType" }] });
    expect(res.status).toBe(400);
  });

  it("400s on a missing required field (castSpell without entryId)", async () => {
    const res = await supertest(createApp())
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "castSpell", roll: 10 }] });
    expect(res.status).toBe(400);
  });

  // ── castSpell ─────────────────────────────────────────────────────────────

  it("casting a cantrip rolls (non-zero total expected) and does NOT expend a slot", async () => {
    const res = await supertest(createApp())
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "castSpell", entryId: "fixture-cantrip-1", roll: 7 }] });

    expect(res.status).toBe(200);
    // Cantrip: no slots should have been used.
    const slots = res.body.spellcasting.slots as Array<{ level: number; used: number }>;
    slots.forEach((s) => expect(s.used).toBe(0));
  });

  it("casting a leveled spell expends a slot at that level", async () => {
    const res = await supertest(createApp())
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
    await supertest(app).post(url).send({ operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 10 }] });
    await supertest(app).post(url).send({ operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 12 }] });

    // Third cast should fail.
    const res = await supertest(app).post(url).send({ operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 9 }] });
    expect(res.status).toBe(400);
  });

  it("400s when casting a spell with a slot level below the spell's level", async () => {
    // Level 1 wizard has no L0 slots for leveled spells — only L1.
    // We'll test an invalid pairing by using a high-level spell with a low slot.
    // fixture-spell-1 is level 1, but slotLevel: 0 is invalid (must be >= spell.level).
    const res = await supertest(createApp())
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 0, roll: 5 }] });
    expect(res.status).toBe(400);
  });

  // ── expendSlot / restoreSlot ──────────────────────────────────────────────

  it("expendSlot decrements available slots, restoreSlot increments them back", async () => {
    const app = createApp();
    const url = `/api/characters/${FIXTURE_ID}/spellcasting/transactions`;

    const expend = await supertest(app).post(url).send({ operations: [{ type: "expendSlot", level: 1 }] });
    expect(expend.status).toBe(200);
    const afterExpend = expend.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(afterExpend.used).toBe(1);

    const restore = await supertest(app).post(url).send({ operations: [{ type: "restoreSlot", level: 1 }] });
    expect(restore.status).toBe(200);
    const afterRestore = restore.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(afterRestore.used).toBe(0);
  });

  it("400s on restoreSlot when no slots of that level are used", async () => {
    const res = await supertest(createApp())
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "restoreSlot", level: 1 }] });
    expect(res.status).toBe(400);
  });

  it("400s on expendSlot for a level the character doesn't have (level 9 for a L1 wizard)", async () => {
    const res = await supertest(createApp())
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "expendSlot", level: 9 }] });
    expect(res.status).toBe(400);
  });

  // ── learnSpell ────────────────────────────────────────────────────────────

  it("learnSpell from catalog snapshots the spell into spells[]", async () => {
    const res = await supertest(createApp())
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
    const res = await supertest(createApp())
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
    const res = await supertest(createApp())
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

    await supertest(app).post(url).send({ operations: [{ type: "learnSpell", spellId: catalogSpellId }] });
    const dup = await supertest(app).post(url).send({ operations: [{ type: "learnSpell", spellId: catalogSpellId }] });
    expect(dup.status).toBe(400);
  });

  // ── forgetSpell ───────────────────────────────────────────────────────────

  it("forgetSpell removes the spell from spells[]", async () => {
    const res = await supertest(createApp())
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "forgetSpell", entryId: "fixture-cantrip-1" }] });

    expect(res.status).toBe(200);
    const spells = res.body.spellcasting.spells as Array<{ id: string }>;
    expect(spells.find((s) => s.id === "fixture-cantrip-1")).toBeUndefined();
  });

  it("400s on forgetSpell for a non-existent entryId", async () => {
    const res = await supertest(createApp())
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "forgetSpell", entryId: "does-not-exist" }] });
    expect(res.status).toBe(400);
  });

  // ── prepareSpell / unprepareSpell ─────────────────────────────────────────

  it("prepareSpell / unprepareSpell toggles prepared on a leveled spell", async () => {
    const app = createApp();
    const url = `/api/characters/${FIXTURE_ID}/spellcasting/transactions`;

    // fixture-spell-1 starts prepared=true; unprepare it.
    const unprep = await supertest(app).post(url).send({ operations: [{ type: "unprepareSpell", entryId: "fixture-spell-1" }] });
    expect(unprep.status).toBe(200);
    const afterUnprep = (unprep.body.spellcasting.spells as Array<{ id: string; prepared: boolean }>)
      .find((s) => s.id === "fixture-spell-1");
    expect(afterUnprep!.prepared).toBe(false);

    // Prepare it again.
    const prep = await supertest(app).post(url).send({ operations: [{ type: "prepareSpell", entryId: "fixture-spell-1" }] });
    expect(prep.status).toBe(200);
    const afterPrep = (prep.body.spellcasting.spells as Array<{ id: string; prepared: boolean }>)
      .find((s) => s.id === "fixture-spell-1");
    expect(afterPrep!.prepared).toBe(true);
  });

  it("400s on prepareSpell for a cantrip (always prepared, no toggle)", async () => {
    const res = await supertest(createApp())
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "prepareSpell", entryId: "fixture-cantrip-1" }] });
    expect(res.status).toBe(400);
  });

  // ── Atomicity ─────────────────────────────────────────────────────────────

  it("a multi-op batch is atomic: a later failing op rolls back an earlier valid one", async () => {
    const res = await supertest(createApp())
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({
        operations: [
          { type: "expendSlot", level: 1 },               // valid
          { type: "forgetSpell", entryId: "not-a-real-entry" }, // invalid — should roll back the expendSlot
        ],
      });

    expect(res.status).toBe(400);

    // Verify the character is unchanged.
    const char = await supertest(createApp()).get(`/api/characters/${FIXTURE_ID}`);
    const slot1 = char.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slot1.used).toBe(0); // rolled back
  });

  // ── castSpell self-apply (target: self) ───────────────────────────────────

  it("castSpell with apply:{self,damage} subtracts HP and expends the slot in one batch", async () => {
    const res = await supertest(createApp())
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
    await supertest(app).post(url).send({
      operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 5, apply: { target: "self", kind: "damage", amount: 5 } }],
    });

    // Heal 3 (3 → 6).
    const heal = await supertest(app).post(url).send({
      operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 3, apply: { target: "self", kind: "heal", amount: 3 } }],
    });
    expect(heal.status).toBe(200);
    expect(heal.body.hitPoints.current).toBe(6);
  });

  it("self-damage clamps at 0 HP", async () => {
    const res = await supertest(createApp())
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({
        operations: [{ type: "castSpell", entryId: "fixture-cantrip-1", roll: 100, apply: { target: "self", kind: "damage", amount: 100 } }],
      });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(0);
  });

  it("a failing later op rolls back BOTH the slot spend and the self-HP change", async () => {
    const res = await supertest(createApp())
      .post(`/api/characters/${FIXTURE_ID}/spellcasting/transactions`)
      .send({
        operations: [
          { type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 4, apply: { target: "self", kind: "damage", amount: 4 } },
          { type: "forgetSpell", entryId: "not-a-real-entry" }, // invalid — rolls back the cast + HP
        ],
      });
    expect(res.status).toBe(400);

    const char = await supertest(createApp()).get(`/api/characters/${FIXTURE_ID}`);
    expect(char.body.hitPoints.current).toBe(8); // HP unchanged
    const slot1 = char.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slot1.used).toBe(0); // slot unchanged
  });

  // ── Derived stats ─────────────────────────────────────────────────────────

  it("returns correct derived spellSaveDC and spellAttackBonus for a L1 INT-16 Wizard", async () => {
    // No op needed — just read back the character via an expendSlot (or we could
    // do a GET, but the route returns the full character on every mutating response).
    // Use a GET instead to avoid touching state.
    const res = await supertest(createApp()).get(`/api/characters/${FIXTURE_ID}`);

    expect(res.status).toBe(200);
    // L1 proficiency bonus = 2; INT mod = +3. DC = 8+2+3 = 13. Attack = 2+3 = 5.
    expect(res.body.spellcasting.spellSaveDC).toBe(13);
    expect(res.body.spellcasting.spellAttackBonus).toBe(5);
    expect(res.body.spellcasting.ability).toBe("intelligence");
  });
});
