import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

// XP thresholds from the 5e table (levelForExperience).
const XP_LVL_1 = 0;
const XP_LVL_3 = 900;

const app = createApp();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function postXp(characterId: string, body: object) {
  return supertest(app).post(`/api/characters/${characterId}/experience`).send(body);
}

async function postUndo(characterId: string, batchId: string) {
  return supertest(app).post(`/api/characters/${characterId}/events/${batchId}/revert`).send({});
}

async function postResource(characterId: string, body: object) {
  return supertest(app).post(`/api/characters/${characterId}/resources/transactions`).send(body);
}

async function getActivity(characterId: string) {
  return supertest(app).get(`/api/characters/${characterId}/activity`);
}

// ── Common catalog fixtures ───────────────────────────────────────────────────

// Unique names avoid colliding with seeded rows.
const FIGHTER_CLASS_NAME = "Test Fighter (XP Suite)";
const BATTLE_MASTER_SUBCLASS_NAME = "battle master"; // exact lowercase key deriveResources uses
const CLERIC_CLASS_NAME = "Test Cleric (XP Suite)";
const LIFE_DOMAIN_SUBCLASS_NAME = "Test Life Domain (XP Suite)";

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 10, constitution: 10,
  intelligence: 10, wisdom: 10, charisma: 10,
};

const BASE_CHARACTER = {
  alignment: "True Neutral",
  armorClass: 14,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  abilityScores: BASE_ABILITY_SCORES,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("POST /api/characters/:id/experience — subclass reset on level-down", () => {
  // Catalog ids set once in beforeAll (cheaper than beforeEach upserts).
  let fighterClassId: string;
  let battleMasterSubclassId: string;
  let clericClassId: string;
  let lifeSubclassId: string;

  beforeAll(async () => {
    const fighterClass = await prisma.characterClass.upsert({
      where: { name: FIGHTER_CLASS_NAME },
      create: {
        name: FIGHTER_CLASS_NAME,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics"],
        isSpellcaster: false,
        subclassLevel: 3,
      },
      update: { subclassLevel: 3 },
    });
    fighterClassId = fighterClass.id;

    const bm = await prisma.subclass.upsert({
      where: { classId_name: { classId: fighterClass.id, name: BATTLE_MASTER_SUBCLASS_NAME } },
      create: { classId: fighterClass.id, name: BATTLE_MASTER_SUBCLASS_NAME, description: "Maneuvers." },
      update: {},
    });
    battleMasterSubclassId = bm.id;

    const clericClass = await prisma.characterClass.upsert({
      where: { name: CLERIC_CLASS_NAME },
      create: {
        name: CLERIC_CLASS_NAME,
        hitDie: "d8",
        savingThrows: ["wisdom", "charisma"],
        skillChoiceCount: 2,
        skillChoices: ["insight"],
        isSpellcaster: true,
        subclassLevel: 1,
      },
      update: { subclassLevel: 1 },
    });
    clericClassId = clericClass.id;

    const life = await prisma.subclass.upsert({
      where: { classId_name: { classId: clericClass.id, name: LIFE_DOMAIN_SUBCLASS_NAME } },
      create: { classId: clericClass.id, name: LIFE_DOMAIN_SUBCLASS_NAME, description: "Healing." },
      update: {},
    });
    lifeSubclassId = life.id;
  });

  afterAll(async () => {
    await prisma.subclass.deleteMany({
      where: { name: { in: [BATTLE_MASTER_SUBCLASS_NAME, LIFE_DOMAIN_SUBCLASS_NAME] } },
    });
    await prisma.characterClass.deleteMany({
      where: { name: { in: [FIGHTER_CLASS_NAME, CLERIC_CLASS_NAME] } },
    });
  });

  // Helper: create a fighter with hitDice.total = 3 (HP level-ups applied) at XP level 3.
  async function createFighterWithHpLevelUps(id: string) {
    const char = await prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        id,
        name: `Fighter ${id}`,
        experiencePoints: XP_LVL_3,
        hitDice: { total: 3, die: "d10", spent: 0 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{
            name: FIGHTER_CLASS_NAME,
            classId: fighterClassId,
            position: 0,
            level: 3,
            subclassId: battleMasterSubclassId,
            subclass: BATTLE_MASTER_SUBCLASS_NAME,
          }],
        },
      },
      include: { classEntries: true },
    });
    // Seed level-up events so revertLevelUps can reverse HP exactly.
    await prisma.characterEvent.createMany({
      data: [
        {
          characterId: id,
          category: "hitPoints", type: "levelUp",
          summary: "Leveled up to 2",
          before: { hitPoints: { current: 20, max: 20, temp: 0 }, hitDice: { total: 1, die: "d10", spent: 0 } },
          after:  { hitPoints: { current: 26, max: 26, temp: 0 }, hitDice: { total: 2, die: "d10", spent: 0 } },
          data: { hpGain: 6, newLevel: 2 }, reverted: false, batchId: `${id}-lvl2`,
          createdAt: new Date(Date.now() - 2000),
        },
        {
          characterId: id,
          category: "hitPoints", type: "levelUp",
          summary: "Leveled up to 3",
          before: { hitPoints: { current: 26, max: 26, temp: 0 }, hitDice: { total: 2, die: "d10", spent: 0 } },
          after:  { hitPoints: { current: 30, max: 30, temp: 0 }, hitDice: { total: 3, die: "d10", spent: 0 } },
          data: { hpGain: 6, newLevel: 3 }, reverted: false, batchId: `${id}-lvl3`,
          createdAt: new Date(Date.now() - 1000),
        },
      ],
    });
    return char;
  }

  // Helper: create a fighter with hitDice.total = 1 (XP at level 3 but no HP level-ups clicked).
  async function createFighterNoHpLevelUps(id: string) {
    return prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        id,
        name: `Fighter No HP ${id}`,
        experiencePoints: XP_LVL_3,
        hitDice: { total: 1, die: "d10", spent: 0 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{
            name: FIGHTER_CLASS_NAME,
            classId: fighterClassId,
            position: 0,
            level: 1,
            subclassId: battleMasterSubclassId,
            subclass: BATTLE_MASTER_SUBCLASS_NAME,
          }],
        },
      },
      include: { classEntries: true },
    });
  }

  afterEach(async () => {
    // Clean up any characters created in this suite — match the id prefix.
    await prisma.character.deleteMany({ where: { name: { startsWith: "Fighter" } } });
    await prisma.character.deleteMany({ where: { name: { startsWith: "Cleric" } } });
  });

  // ── Root cause 1 (no HP level-ups): the core bug the fix addresses ───────

  it("clears subclass when XP drops below subclassLevel, even when hitDice.total = 1 (no HP level-ups applied)", async () => {
    const char = await createFighterNoHpLevelUps("test-xp-f-no-hp");
    const entryId = char.classEntries[0].id;

    const res = await postXp("test-xp-f-no-hp", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);

    // Serialized response shows no subclass (null → undefined).
    expect(res.body.classes?.[0]?.subclass).toBeUndefined();

    // DB row is cleared.
    const entry = await prisma.characterClassEntry.findUnique({ where: { id: entryId } });
    expect(entry?.subclassId).toBeNull();
    expect(entry?.subclass).toBeNull();
  });

  it("emits a class/subclassRemoved event (no HP level-ups case)", async () => {
    await createFighterNoHpLevelUps("test-xp-f-no-hp-2");

    await postXp("test-xp-f-no-hp-2", { operations: [{ type: "set", value: XP_LVL_1 }] });

    const actRes = await getActivity("test-xp-f-no-hp-2");
    const removedEvent = actRes.body.find((e: { type: string }) => e.type === "subclassRemoved");
    expect(removedEvent).toBeDefined();
    expect(removedEvent.category).toBe("class");
  });

  // ── Fighter with HP level-ups applied ────────────────────────────────────

  it("clears subclass when XP drops below subclassLevel (HP level-ups have been applied)", async () => {
    const char = await createFighterWithHpLevelUps("test-xp-f-with-hp");
    const entryId = char.classEntries[0].id;

    const res = await postXp("test-xp-f-with-hp", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);
    expect(res.body.classes?.[0]?.subclass).toBeUndefined();

    const entry = await prisma.characterClassEntry.findUnique({ where: { id: entryId } });
    expect(entry?.subclassId).toBeNull();
    expect(entry?.subclass).toBeNull();
  });

  it("also resets the class entry level to 1 (HP level-ups case)", async () => {
    await createFighterWithHpLevelUps("test-xp-f-level");

    const res = await postXp("test-xp-f-level", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);
    expect(res.body.classes?.[0]?.level).toBe(1);
  });

  // ── Resources cleared after subclass is removed ───────────────────────────

  it("serialized resources is undefined after subclass is cleared", async () => {
    await createFighterNoHpLevelUps("test-xp-f-res");

    const res = await postXp("test-xp-f-res", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);
    // No subclass → deriveResources returns null → resources undefined in response.
    expect(res.body.resources).toBeUndefined();
  });

  it("spending a resource returns 400 after subclass is cleared", async () => {
    await createFighterNoHpLevelUps("test-xp-f-spend");

    await postXp("test-xp-f-spend", { operations: [{ type: "set", value: XP_LVL_1 }] });

    const spendRes = await postResource("test-xp-f-spend", {
      operations: [{ type: "spendResource", key: "superiorityDice" }],
    });
    expect(spendRes.status).toBe(400);
  });

  // ── subclassLevel = 1 class preserves its subclass at level 1 ─────────────

  it("preserves a subclassLevel=1 subclass (Cleric) when XP drops to level 1", async () => {
    const cleric = await prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        id: "test-xp-cleric-1",
        name: "Cleric test-xp-cleric-1",
        experiencePoints: XP_LVL_3,
        hitDice: { total: 3, die: "d8", spent: 0 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{
            name: CLERIC_CLASS_NAME,
            classId: clericClassId,
            position: 0,
            level: 3,
            subclassId: lifeSubclassId,
            subclass: LIFE_DOMAIN_SUBCLASS_NAME,
          }],
        },
      },
      include: { classEntries: true },
    });

    const res = await postXp("test-xp-cleric-1", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);

    // Subclass should be preserved (level 1 >= subclassLevel 1).
    expect(res.body.classes?.[0]?.subclass).toBe(LIFE_DOMAIN_SUBCLASS_NAME);

    const entry = await prisma.characterClassEntry.findUnique({
      where: { id: cleric.classEntries[0].id },
    });
    expect(entry?.subclassId).toBe(lifeSubclassId);
    expect(entry?.subclass).toBe(LIFE_DOMAIN_SUBCLASS_NAME);
  });

  // ── Undo restores the subclass ────────────────────────────────────────────

  it("undoing the XP reset restores the Fighter's subclass via the subclassRemoved event", async () => {
    const char = await createFighterNoHpLevelUps("test-xp-f-undo");
    const entryId = char.classEntries[0].id;

    // Reset (clears subclass).
    const resetRes = await postXp("test-xp-f-undo", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.classes?.[0]?.subclass).toBeUndefined();

    // The most recent batch in the activity log is the one we want to undo.
    const activityRes = await getActivity("test-xp-f-undo");
    expect(activityRes.status).toBe(200);
    const batchId: string = activityRes.body[0]?.batchId;
    expect(batchId).toBeTruthy();

    // Undo it.
    const undoRes = await postUndo("test-xp-f-undo", batchId);
    expect(undoRes.status).toBe(200);

    // Subclass is restored on the DB row.
    const entry = await prisma.characterClassEntry.findUnique({ where: { id: entryId } });
    expect(entry?.subclassId).toBe(battleMasterSubclassId);
    expect(entry?.subclass).toBe(BATTLE_MASTER_SUBCLASS_NAME);
  });
});

// ── Maneuver reconciliation suite ─────────────────────────────────────────────
// Tests the reconcileManeuvers step in level-reconciliation.ts and the
// read-clamp added to serializeCharacter.

describe("POST /api/characters/:id/experience — maneuvers reconciled on level-down", () => {
  const XP_LVL_7 = 23000; // battleMasterManeuverCount(7) = 5
  // XP_LVL_3 = 900 already declared above (900 → level 3, maneuverCount = 3).

  let fighterClassId2: string;
  let battleMasterSubclassId2: string;

  // Unique names to avoid colliding with the first suite's catalog rows.
  const FIGHTER_CLASS_NAME2 = "Test Fighter (Maneuver Suite)";
  const BM_SUBCLASS_NAME2 = "battle master"; // exact lowercase key

  beforeAll(async () => {
    const fc = await prisma.characterClass.upsert({
      where: { name: FIGHTER_CLASS_NAME2 },
      create: {
        name: FIGHTER_CLASS_NAME2,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics"],
        isSpellcaster: false,
        subclassLevel: 3,
      },
      update: { subclassLevel: 3 },
    });
    fighterClassId2 = fc.id;

    const bm = await prisma.subclass.upsert({
      where: { classId_name: { classId: fc.id, name: BM_SUBCLASS_NAME2 } },
      create: { classId: fc.id, name: BM_SUBCLASS_NAME2, description: "Maneuvers." },
      update: {},
    });
    battleMasterSubclassId2 = bm.id;
  });

  afterAll(async () => {
    await prisma.subclass.deleteMany({
      where: { classId: fighterClassId2, name: BM_SUBCLASS_NAME2 },
    });
    await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CLASS_NAME2 } });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: "Maneuver" } } });
  });

  /** Helper: 5 seeded maneuver entries. */
  function fiveManeuvers() {
    return [
      { id: "m1", name: "Disarming Attack", description: "Force target to drop." },
      { id: "m2", name: "Riposte", description: "Counter when enemy misses." },
      { id: "m3", name: "Trip Attack", description: "Knock target prone." },
      { id: "m4", name: "Sweeping Attack", description: "Hit adjacent foe." },
      { id: "m5", name: "Menacing Attack", description: "Frighten the target." },
    ];
  }

  /** Creates a level-7 Fighter with Battle Master and 5 known maneuvers. */
  async function createLvl7FighterWithManeuvers(id: string) {
    return prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        id,
        name: `Maneuver ${id}`,
        experiencePoints: XP_LVL_7,
        hitDice: { total: 7, die: "d10", spent: 0 },
        hitPoints: { current: 70, max: 70, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        spellcasting: Prisma.JsonNull,
        resources: {
          used: {},
          maneuversKnown: fiveManeuvers(),
        },
        classEntries: {
          create: [{
            name: FIGHTER_CLASS_NAME2,
            classId: fighterClassId2,
            position: 0,
            level: 7,
            subclassId: battleMasterSubclassId2,
            subclass: BM_SUBCLASS_NAME2,
          }],
        },
      },
    });
  }

  // ── Partial trim (level 7 → 3: 5 maneuvers → 3) ───────────────────────────

  it("trims maneuversKnown from 5 to 3 when XP drops from level 7 to level 3", async () => {
    await createLvl7FighterWithManeuvers("test-man-trim");

    const res = await postXp("test-man-trim", { operations: [{ type: "set", value: XP_LVL_3 }] });
    expect(res.status).toBe(200);

    // Serialized response reflects trimmed list.
    expect(res.body.resources?.maneuverChoiceCount).toBe(3);
    expect(res.body.resources?.maneuversKnown).toHaveLength(3);
    // Oldest 3 kept (LIFO: drop from the tail).
    expect(res.body.resources?.maneuversKnown[0].id).toBe("m1");
    expect(res.body.resources?.maneuversKnown[2].id).toBe("m3");

    // Subclass preserved (level 3 >= subclassLevel 3).
    expect(res.body.classes?.[0]?.subclass).toBe(BM_SUBCLASS_NAME2);

    // Persisted state trimmed.
    const row = await prisma.character.findUnique({
      where: { id: "test-man-trim" },
      select: { resources: true },
    });
    const stored = (row?.resources as { maneuversKnown: unknown[] } | null);
    expect(stored?.maneuversKnown).toHaveLength(3);
  });

  // ── Full clear (level 7 → 0: subclass removed, all maneuvers emptied) ──────

  it("empties maneuversKnown when XP drops to 0 (subclass removed at same time)", async () => {
    await createLvl7FighterWithManeuvers("test-man-full");

    const res = await postXp("test-man-full", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);

    // No subclass → no resources block.
    expect(res.body.resources).toBeUndefined();
    expect(res.body.classes?.[0]?.subclass).toBeUndefined();

    // Persisted maneuversKnown is empty.
    const row = await prisma.character.findUnique({
      where: { id: "test-man-full" },
      select: { resources: true },
    });
    const stored = (row?.resources as { maneuversKnown: unknown[] } | null);
    expect(stored?.maneuversKnown).toHaveLength(0);
  });

  // ── Event emitted ──────────────────────────────────────────────────────────

  it("emits a resources/maneuversReconciled event in the activity log", async () => {
    await createLvl7FighterWithManeuvers("test-man-event");

    await postXp("test-man-event", { operations: [{ type: "set", value: XP_LVL_3 }] });

    const actRes = await getActivity("test-man-event");
    const reconciledEvent = actRes.body.find(
      (e: { type: string }) => e.type === "maneuversReconciled",
    );
    expect(reconciledEvent).toBeDefined();
    expect(reconciledEvent.category).toBe("resources");
  });

  // ── Undo restores both subclass and all 5 maneuvers ───────────────────────

  it("undoing a full XP reset restores the subclass and all 5 maneuvers", async () => {
    const char = await createLvl7FighterWithManeuvers("test-man-undo");

    // Reset to 0 — both subclass and maneuvers gone.
    const resetRes = await postXp("test-man-undo", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.resources).toBeUndefined();

    // Find the batch to undo.
    const activityRes = await getActivity("test-man-undo");
    expect(activityRes.status).toBe(200);
    const batchId: string = activityRes.body[0]?.batchId;
    expect(batchId).toBeTruthy();

    // Undo it.
    const undoRes = await postUndo("test-man-undo", batchId);
    expect(undoRes.status).toBe(200);

    // Resources restored.
    const row = await prisma.character.findUnique({
      where: { id: "test-man-undo" },
      select: {
        resources: true,
        classEntries: { orderBy: { position: "asc" }, take: 1, select: { subclass: true, subclassId: true } },
      },
    });
    const stored = (row?.resources as { maneuversKnown: unknown[] } | null);
    expect(stored?.maneuversKnown).toHaveLength(5);
    expect(row?.classEntries[0]?.subclass).toBe(BM_SUBCLASS_NAME2);
    expect(row?.classEntries[0]?.subclassId).toBe(battleMasterSubclassId2);

    // Suppress unused-var warning from beforeAll ids (char used only for type check).
    void char;
  });

  // ── Read-clamp (defense-in-depth — no XP op needed) ──────────────────────

  it("GET serializes only 3 maneuvers for a level-3 character with 5 stored (read-clamp)", async () => {
    // Create directly at level 3 with 5 stored maneuvers (no reconciling XP op).
    await prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        id: "test-man-clamp",
        name: "Maneuver test-man-clamp",
        experiencePoints: XP_LVL_3,
        hitDice: { total: 3, die: "d10", spent: 0 },
        spellcasting: Prisma.JsonNull,
        resources: {
          used: {},
          maneuversKnown: fiveManeuvers(),
        },
        classEntries: {
          create: [{
            name: FIGHTER_CLASS_NAME2,
            classId: fighterClassId2,
            position: 0,
            level: 3,
            subclassId: battleMasterSubclassId2,
            subclass: BM_SUBCLASS_NAME2,
          }],
        },
      },
    });

    const res = await supertest(app).get("/api/characters/test-man-clamp");
    expect(res.status).toBe(200);
    // Read-clamp: serialized to 3 even though 5 are stored.
    expect(res.body.resources?.maneuversKnown).toHaveLength(3);
    // DB still has 5 (write-side reconciliation has not yet run).
    const row = await prisma.character.findUnique({
      where: { id: "test-man-clamp" },
      select: { resources: true },
    });
    const stored = (row?.resources as { maneuversKnown: unknown[] } | null);
    expect(stored?.maneuversKnown).toHaveLength(5);
  });
});

// ── Fighting Style reconciliation suite ───────────────────────────────────────
// Tests reconcileFightingStyle in level-reconciliation.ts and the read-clamp in
// serializeCharacter. A pure Fighter keeps its style at every level >= 1, so the
// reconciler only clears it on a class change (fightingStyleChoiceCount -> 0).

describe("POST /api/characters/:id/experience — fighting style reconciled on class change", () => {
  const XP_LVL_5 = 6500;

  let fsFighterClassId: string;
  let fsWizardClassId: string;

  const FS_FIGHTER_NAME = "Test Fighter (FS Recon Suite)";
  const FS_WIZARD_NAME = "Test Wizard (FS Recon Suite)";

  beforeAll(async () => {
    const fc = await prisma.characterClass.upsert({
      where: { name: FS_FIGHTER_NAME },
      create: {
        name: FS_FIGHTER_NAME,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics"],
        isSpellcaster: false,
      },
      update: {},
    });
    fsFighterClassId = fc.id;

    const wc = await prisma.characterClass.upsert({
      where: { name: FS_WIZARD_NAME },
      create: {
        name: FS_WIZARD_NAME,
        hitDie: "d6",
        savingThrows: ["intelligence", "wisdom"],
        skillChoiceCount: 2,
        skillChoices: ["arcana"],
        isSpellcaster: true,
      },
      update: {},
    });
    fsWizardClassId = wc.id;
  });

  afterAll(async () => {
    await prisma.characterClass.deleteMany({
      where: { name: { in: [FS_FIGHTER_NAME, FS_WIZARD_NAME] } },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: "FSRecon" } } });
  });

  /** Creates a level-5 Fighter (entry name "fighter") with a chosen Defense style. */
  async function createFighterWithStyle(id: string) {
    return prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        id,
        name: `FSRecon ${id}`,
        experiencePoints: XP_LVL_5,
        hitDice: { total: 5, die: "d10", spent: 0 },
        hitPoints: { current: 44, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        spellcasting: Prisma.JsonNull,
        resources: {
          used: {},
          maneuversKnown: [],
          toolProficienciesKnown: [],
          advancements: [],
          fightingStyle: "defense",
        },
        classEntries: {
          create: [{ name: "fighter", classId: fsFighterClassId, position: 0, level: 5 }],
        },
      },
    });
  }

  it("clears fightingStyle + emits fightingStyleRemoved when the class is no longer Fighter", async () => {
    await createFighterWithStyle("test-fs-clear");
    // Change the class entry to a non-fighter (simulates a class change).
    await prisma.characterClassEntry.updateMany({
      where: { characterId: "test-fs-clear" },
      data: { name: "wizard", classId: fsWizardClassId },
    });

    // Any XP op fires reconciliation (level unchanged at 5).
    const res = await postXp("test-fs-clear", { operations: [{ type: "set", value: XP_LVL_5 }] });
    expect(res.status).toBe(200);
    expect(res.body.resources?.fightingStyle ?? null).toBeNull();

    // Persisted state cleared.
    const row = await prisma.character.findUnique({
      where: { id: "test-fs-clear" },
      select: { resources: true },
    });
    const stored = row?.resources as { fightingStyle?: string | null } | null;
    expect(stored?.fightingStyle ?? null).toBeNull();

    // Event emitted under the resources category.
    const actRes = await getActivity("test-fs-clear");
    const ev = actRes.body.find((e: { type: string }) => e.type === "fightingStyleRemoved");
    expect(ev).toBeDefined();
    expect(ev.category).toBe("resources");
  });

  it("keeps fightingStyle on an XP op while the character is still a Fighter", async () => {
    await createFighterWithStyle("test-fs-keep");
    const res = await postXp("test-fs-keep", { operations: [{ type: "set", value: XP_LVL_5 }] });
    expect(res.status).toBe(200);
    expect(res.body.resources?.fightingStyle).toBe("defense");
  });

  it("undo restores the cleared fighting style", async () => {
    await createFighterWithStyle("test-fs-undo");
    await prisma.characterClassEntry.updateMany({
      where: { characterId: "test-fs-undo" },
      data: { name: "wizard", classId: fsWizardClassId },
    });
    const resetRes = await postXp("test-fs-undo", { operations: [{ type: "set", value: XP_LVL_5 }] });
    expect(resetRes.status).toBe(200);

    const activityRes = await getActivity("test-fs-undo");
    const batchId: string = activityRes.body[0]?.batchId;
    expect(batchId).toBeTruthy();

    const undoRes = await postUndo("test-fs-undo", batchId);
    expect(undoRes.status).toBe(200);

    const row = await prisma.character.findUnique({
      where: { id: "test-fs-undo" },
      select: { resources: true },
    });
    const stored = row?.resources as { fightingStyle?: string | null } | null;
    expect(stored?.fightingStyle).toBe("defense");
  });

  it("read-clamp serves null fightingStyle for a non-Fighter with a stored style (no XP op)", async () => {
    await prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        id: "test-fs-clamp",
        name: "FSRecon test-fs-clamp",
        experiencePoints: XP_LVL_5,
        hitDice: { total: 5, die: "d6", spent: 0 },
        hitPoints: { current: 25, max: 25, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        spellcasting: Prisma.JsonNull,
        resources: {
          used: {},
          maneuversKnown: [],
          toolProficienciesKnown: [],
          advancements: [],
          fightingStyle: "defense",
        },
        classEntries: {
          create: [{ name: "wizard", classId: fsWizardClassId, position: 0, level: 5 }],
        },
      },
    });

    const res = await supertest(app).get("/api/characters/test-fs-clamp");
    expect(res.status).toBe(200);
    expect(res.body.resources?.fightingStyle ?? null).toBeNull();
    // DB still holds the stale value (write-side reconcile has not run).
    const row = await prisma.character.findUnique({
      where: { id: "test-fs-clamp" },
      select: { resources: true },
    });
    const stored = row?.resources as { fightingStyle?: string | null } | null;
    expect(stored?.fightingStyle).toBe("defense");
  });
});
