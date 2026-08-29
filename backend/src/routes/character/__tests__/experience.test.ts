import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
import { battleMasterResourceRowsData } from "@/test-support/fighter-resource-rows.js";

const OWNER_ID = "owner-experience";
let COOKIE: string;

const XP_LVL_1 = 0;
const XP_LVL_3 = 900;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

async function postXp(characterId: string, body: object) {
  return supertest(app).post(`/api/characters/${characterId}/experience`).set("Cookie", COOKIE).send(body);
}

async function postUndo(characterId: string, batchId: string) {
  return supertest(app).post(`/api/characters/${characterId}/events/${batchId}/revert`).set("Cookie", COOKIE).send({});
}

async function postResource(characterId: string, body: object) {
  return supertest(app).post(`/api/characters/${characterId}/resources/transactions`).set("Cookie", COOKIE).send(body);
}

async function getActivity(characterId: string) {
  return supertest(app).get(`/api/characters/${characterId}/activity`).set("Cookie", COOKIE);
}

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
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  abilityScores: BASE_ABILITY_SCORES,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("POST /api/characters/:id/experience — subclass reset on level-down", () => {
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

    const bm = await upsertEditionRow(
      prisma.subclass,
      { classId: fighterClass.id, name: BATTLE_MASTER_SUBCLASS_NAME, edition: null },
      // Distinct slug from the real seeded "fighter-battle-master" (#1277) — this test's Fighter class is its own throwaway row.
      { classId: fighterClass.id, name: BATTLE_MASTER_SUBCLASS_NAME, description: "Maneuvers.", slug: "fighter-battle-master-experience-test" },
      {},
    );
    battleMasterSubclassId = bm.id;
    // battleMasterResourceRowsData is a shared helper, not a per-file copy — every bespoke Battle Master Subclass row needs this (#1546).
    await prisma.classFeature.deleteMany({ where: { subclassId: battleMasterSubclassId } });
    await prisma.classFeature.createMany({ data: battleMasterResourceRowsData(fighterClassId, battleMasterSubclassId) });

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

    const life = await upsertEditionRow(
      prisma.subclass,
      { classId: clericClass.id, name: LIFE_DOMAIN_SUBCLASS_NAME, edition: null },
      { classId: clericClass.id, name: LIFE_DOMAIN_SUBCLASS_NAME, description: "Healing.", slug: "cleric-test-life-domain-xp-suite" },
      {},
    );
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

  async function createFighterWithHpLevelUps(id: string) {
    await ensureTestOwner(OWNER_ID);
    const char = await prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
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

  async function createFighterNoHpLevelUps(id: string) {
    await ensureTestOwner(OWNER_ID);
    return prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
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
    await prisma.character.deleteMany({ where: { name: { startsWith: "Fighter" } } });
    await prisma.character.deleteMany({ where: { name: { startsWith: "Cleric" } } });
  });

  it("clears subclass when XP drops below subclassLevel, even when hitDice.total = 1 (no HP level-ups applied)", async () => {
    const char = await createFighterNoHpLevelUps("test-xp-f-no-hp");
    const entryId = char.classEntries[0].id;

    const res = await postXp("test-xp-f-no-hp", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);

    expect(res.body.classes?.[0]?.subclass).toBeUndefined();

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

  it("serialized resources is undefined after subclass is cleared", async () => {
    await createFighterNoHpLevelUps("test-xp-f-res");

    const res = await postXp("test-xp-f-res", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);
    // No subclass → deriveResources returns null → resources undefined in the response.
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

  // subclassLevel=1 is a PHB'14 shape (Cleric/Sorcerer/Warlock); SRD 5.2 gates every class at 3 (#1285).
  it("preserves a subclassLevel=1 subclass (Cleric) when XP drops to level 1", async () => {
    await ensureTestOwner(OWNER_ID);
    const cleric = await prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
        rulesEdition: "EDITION_2014",
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

    expect(res.body.classes?.[0]?.subclass).toBe(LIFE_DOMAIN_SUBCLASS_NAME);

    const entry = await prisma.characterClassEntry.findUnique({
      where: { id: cleric.classEntries[0].id },
    });
    expect(entry?.subclassId).toBe(lifeSubclassId);
    expect(entry?.subclass).toBe(LIFE_DOMAIN_SUBCLASS_NAME);
  });

  it("undoing the XP reset restores the Fighter's subclass via the subclassRemoved event", async () => {
    const char = await createFighterNoHpLevelUps("test-xp-f-undo");
    const entryId = char.classEntries[0].id;

    const resetRes = await postXp("test-xp-f-undo", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.classes?.[0]?.subclass).toBeUndefined();

    const activityRes = await getActivity("test-xp-f-undo");
    expect(activityRes.status).toBe(200);
    const batchId: string = activityRes.body[0]?.batchId;
    expect(batchId).toBeTruthy();

    const undoRes = await postUndo("test-xp-f-undo", batchId);
    expect(undoRes.status).toBe(200);

    const entry = await prisma.characterClassEntry.findUnique({ where: { id: entryId } });
    expect(entry?.subclassId).toBe(battleMasterSubclassId);
    expect(entry?.subclass).toBe(BATTLE_MASTER_SUBCLASS_NAME);
  });
});

describe("POST /api/characters/:id/experience — maneuvers reconciled on level-down", () => {
  const XP_LVL_7 = 23000;

  let fighterClassId2: string;
  let battleMasterSubclassId2: string;

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

    const bm = await upsertEditionRow(
      prisma.subclass,
      { classId: fc.id, name: BM_SUBCLASS_NAME2, edition: null },
      { classId: fc.id, name: BM_SUBCLASS_NAME2, description: "Maneuvers.", slug: "fighter-battle-master-experience-test-2" },
      {},
    );
    battleMasterSubclassId2 = bm.id;
    // battleMasterResourceRowsData is a shared helper, not a per-file copy (#1546).
    await prisma.classFeature.deleteMany({ where: { subclassId: battleMasterSubclassId2 } });
    await prisma.classFeature.createMany({ data: battleMasterResourceRowsData(fighterClassId2, battleMasterSubclassId2) });
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

  function fiveManeuvers() {
    return [
      { id: "m1", name: "Disarming Attack", description: "Force target to drop." },
      { id: "m2", name: "Riposte", description: "Counter when enemy misses." },
      { id: "m3", name: "Trip Attack", description: "Knock target prone." },
      { id: "m4", name: "Sweeping Attack", description: "Hit adjacent foe." },
      { id: "m5", name: "Menacing Attack", description: "Frighten the target." },
    ];
  }

  async function createLvl7FighterWithManeuvers(id: string) {
    await ensureTestOwner(OWNER_ID);
    return prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
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

  it("trims maneuversKnown from 5 to 3 when XP drops from level 7 to level 3", async () => {
    await createLvl7FighterWithManeuvers("test-man-trim");

    const res = await postXp("test-man-trim", { operations: [{ type: "set", value: XP_LVL_3 }] });
    expect(res.status).toBe(200);

    expect(res.body.resources?.maneuverChoiceCount).toBe(3);
    expect(res.body.resources?.maneuversKnown).toHaveLength(3);
    // Oldest 3 kept (LIFO: drop from the tail).
    expect(res.body.resources?.maneuversKnown[0].id).toBe("m1");
    expect(res.body.resources?.maneuversKnown[2].id).toBe("m3");

    expect(res.body.classes?.[0]?.subclass).toBe(BM_SUBCLASS_NAME2);

    const row = await prisma.character.findUnique({
      where: { id: "test-man-trim" },
      select: { resources: true },
    });
    const stored = (row?.resources as { maneuversKnown: unknown[] } | null);
    expect(stored?.maneuversKnown).toHaveLength(3);
  });

  it("empties maneuversKnown when XP drops to 0 (subclass removed at same time)", async () => {
    await createLvl7FighterWithManeuvers("test-man-full");

    const res = await postXp("test-man-full", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);

    expect(res.body.resources).toBeUndefined();
    expect(res.body.classes?.[0]?.subclass).toBeUndefined();

    const row = await prisma.character.findUnique({
      where: { id: "test-man-full" },
      select: { resources: true },
    });
    const stored = (row?.resources as { maneuversKnown: unknown[] } | null);
    expect(stored?.maneuversKnown).toHaveLength(0);
  });

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

  it("undoing a full XP reset restores the subclass and all 5 maneuvers", async () => {
    const char = await createLvl7FighterWithManeuvers("test-man-undo");

    const resetRes = await postXp("test-man-undo", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.resources).toBeUndefined();

    const activityRes = await getActivity("test-man-undo");
    expect(activityRes.status).toBe(200);
    const batchId: string = activityRes.body[0]?.batchId;
    expect(batchId).toBeTruthy();

    const undoRes = await postUndo("test-man-undo", batchId);
    expect(undoRes.status).toBe(200);

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

    // Suppresses an unused-var warning: char is used only for its type.
    void char;
  });

  it("GET serializes only 3 maneuvers for a level-3 character with 5 stored (read-clamp)", async () => {
    await ensureTestOwner(OWNER_ID);
    await prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
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

    const res = await supertest.agent(app).set("Cookie", COOKIE).get("/api/characters/test-man-clamp");
    expect(res.status).toBe(200);
    expect(res.body.resources?.maneuversKnown).toHaveLength(3);
    const row = await prisma.character.findUnique({
      where: { id: "test-man-clamp" },
      select: { resources: true },
    });
    const stored = (row?.resources as { maneuversKnown: unknown[] } | null);
    expect(stored?.maneuversKnown).toHaveLength(5);
  });
});

// Subclass grants are derived and never persisted in the happy path.
describe("POST /api/characters/:id/experience — granted spells reconciled on level-down", () => {
  let gsMonkClassId: string;
  const GS_MONK_NAME = "Test Monk (Granted Spell Suite)";

  const leakedSpellcasting = () => ({
    slotsUsed: {},
    spells: [{
      id: "granted:warrior-of-shadow:minor-illusion",
      name: "Minor Illusion",
      level: 0, school: "illusion", prepared: true, source: "subclass",
      castingTime: "1 action", range: "30 ft", duration: "1 minute",
      description: "Leaked persisted grant.",
    }],
  });

  beforeAll(async () => {
    const mc = await prisma.characterClass.upsert({
      where: { name: GS_MONK_NAME },
      create: {
        name: GS_MONK_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"],
        skillChoiceCount: 2, skillChoices: ["stealth"], isSpellcaster: false, subclassLevel: 3,
      },
      update: { subclassLevel: 3 },
    });
    gsMonkClassId = mc.id;
  });

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: GS_MONK_NAME } });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: "GrantedSpell" } } });
  });

  async function createLvl3ShadowMonk(id: string) {
    await ensureTestOwner(OWNER_ID);
    return prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
        id,
        name: `GrantedSpell ${id}`,
        experiencePoints: XP_LVL_3,
        hitDice: { total: 3, die: "d8", spent: 0 },
        spellcasting: leakedSpellcasting() as Prisma.InputJsonValue,
        classEntries: {
          create: [{ name: GS_MONK_NAME, classId: gsMonkClassId, position: 0, level: 3, subclass: "Warrior of Shadow" }],
        },
      },
    });
  }

  it("strips a leaked persisted granted spell when XP drops below level 3", async () => {
    await createLvl3ShadowMonk("test-gs-strip");
    const res = await postXp("test-gs-strip", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);

    const row = await prisma.character.findUnique({ where: { id: "test-gs-strip" }, select: { spellcasting: true } });
    const stored = row?.spellcasting as { spells: unknown[] } | null;
    expect(stored?.spells).toHaveLength(0);
  });

  it("emits a spellcasting event for the stripped grant", async () => {
    await createLvl3ShadowMonk("test-gs-event");
    await postXp("test-gs-event", { operations: [{ type: "set", value: XP_LVL_1 }] });

    const actRes = await getActivity("test-gs-event");
    // reconcileGrantedSpells strips a leaked species grant the same way as a subclass one (#1683).
    const ev = actRes.body.find(
      (e: { category: string; summary: string }) => e.category === "spellcasting" && e.summary.includes("granted spell"),
    );
    expect(ev).toBeDefined();
  });

  it("nulls concentration when the concentrated spell was the stripped grant", async () => {
    await ensureTestOwner(OWNER_ID);
    await prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
        id: "test-gs-conc",
        name: "GrantedSpell test-gs-conc",
        experiencePoints: XP_LVL_3,
        hitDice: { total: 3, die: "d8", spent: 0 },
        spellcasting: {
          ...leakedSpellcasting(),
          concentratingOn: { entryId: "granted:warrior-of-shadow:minor-illusion", spellName: "Minor Illusion" },
        } as Prisma.InputJsonValue,
        classEntries: {
          create: [{ name: GS_MONK_NAME, classId: gsMonkClassId, position: 0, level: 3, subclass: "Warrior of Shadow" }],
        },
      },
    });

    const res = await postXp("test-gs-conc", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);

    const row = await prisma.character.findUnique({ where: { id: "test-gs-conc" }, select: { spellcasting: true } });
    const stored = row?.spellcasting as { spells: unknown[]; concentratingOn: unknown } | null;
    expect(stored?.spells).toHaveLength(0);
    expect(stored?.concentratingOn).toBeNull();
  });

  it("undo restores the leaked granted spell entry", async () => {
    await createLvl3ShadowMonk("test-gs-undo");
    const resetRes = await postXp("test-gs-undo", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(resetRes.status).toBe(200);

    const activityRes = await getActivity("test-gs-undo");
    const batchId: string = activityRes.body[0]?.batchId;
    expect(batchId).toBeTruthy();

    const undoRes = await postUndo("test-gs-undo", batchId);
    expect(undoRes.status).toBe(200);

    const row = await prisma.character.findUnique({ where: { id: "test-gs-undo" }, select: { spellcasting: true } });
    const stored = row?.spellcasting as { spells: Array<{ source?: string }> } | null;
    expect(stored?.spells).toHaveLength(1);
    expect(stored?.spells[0].source).toBe("subclass");
  });
});

describe("POST /api/characters/:id/experience — species-granted spells reconciled on level-down (#1683)", () => {
  let elfSpeciesId: string;
  let drowVariantId: string;

  beforeAll(async () => {
    const elf = await prisma.species.findFirstOrThrow({
      where: { slug: "elf", edition: "EDITION_2024" },
      select: { id: true, variants: { where: { slug: "drow" }, select: { id: true } } },
    });
    elfSpeciesId = elf.id;
    drowVariantId = elf.variants[0].id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: "SpeciesGrantedSpell" } } });
  });

  const leakedSpellcasting = () => ({
    slotsUsed: {},
    spells: [{
      id: "granted:drow:faerie-fire",
      name: "Faerie Fire",
      level: 1, school: "evocation", prepared: true, source: "species",
      castingTime: "1 action", range: "60 ft", duration: "Concentration, up to 1 minute",
      description: "Leaked persisted grant.",
    }],
  });

  async function createLvl3Drow(id: string) {
    await ensureTestOwner(OWNER_ID);
    return prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
        id,
        name: `SpeciesGrantedSpell ${id}`,
        rulesEdition: "EDITION_2024",
        experiencePoints: XP_LVL_3,
        hitDice: { total: 3, die: "d10", spent: 0 },
        spellcasting: leakedSpellcasting() as Prisma.InputJsonValue,
        raceSelection: {
          create: { name: "Drow", speciesId: elfSpeciesId, variantId: drowVariantId, variantName: "Drow", castingAbility: "charisma" },
        },
        classEntries: { create: [{ name: "Fighter", position: 0, level: 3 }] },
      },
    });
  }

  it("strips a leaked persisted species grant when XP drops below its gate level", async () => {
    await createLvl3Drow("test-species-gs-strip");
    const res = await postXp("test-species-gs-strip", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);

    const row = await prisma.character.findUnique({ where: { id: "test-species-gs-strip" }, select: { spellcasting: true } });
    const stored = row?.spellcasting as { spells: unknown[] } | null;
    expect(stored?.spells).toHaveLength(0);
  });

  it("emits a spellcasting event for the stripped species grant", async () => {
    await createLvl3Drow("test-species-gs-event");
    await postXp("test-species-gs-event", { operations: [{ type: "set", value: XP_LVL_1 }] });

    const actRes = await getActivity("test-species-gs-event");
    const ev = actRes.body.find(
      (e: { category: string; summary: string }) => e.category === "spellcasting" && e.summary.includes("granted spell"),
    );
    expect(ev).toBeDefined();
  });
});

// Fighting Style feats live in advancements[] tagged slot:"fightingStyle" and reconcile through reconcileAdvancements' fs partition, independent of the ASI partition; origin feats are exempt.
describe("POST /api/characters/:id/experience — Fighting Style feat reconciliation", () => {
  const XP_L1 = 0, XP_L2 = 300, XP_L4 = 2700, XP_L5 = 6500;

  const fsFeat = () => ({
    id: "fs-recon-feat", level: 2, kind: "feat" as const, slot: "fightingStyle" as const,
    abilityDeltas: {}, hpDelta: 0, initDelta: 0,
    featName: "Defense", featDescription: "d", improvements: [{ target: "armorClassWhileArmored", amount: 1 }],
  });
  const resourcesWith = (advancements: unknown[]) => ({
    used: {}, maneuversKnown: [], toolProficienciesKnown: [], choicesKnown: {},
    advancements, fightingStyle: null,
  } as unknown as Prisma.InputJsonValue);

  // Every entry must link classId to its real seeded row, or the slot cap is 0 (homebrew) and every "removed" assertion here would be vacuously true.
  let classIds: Record<string, string>;

  beforeAll(async () => {
    const rows = await prisma.characterClass.findMany({ where: { name: { in: ["Fighter", "Paladin", "Wizard"] } }, select: { id: true, name: true } });
    classIds = Object.fromEntries(rows.map((r) => [r.name, r.id]));
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: "FSFeatRecon" } } });
  });

  async function create(id: string, entries: { name: string; position: number; level: number }[], xp: number, advancements: unknown[]) {
    await ensureTestOwner(OWNER_ID);
    return prisma.character.create({
      data: {
        ...BASE_CHARACTER, ownerId: OWNER_ID, id, name: `FSFeatRecon ${id}`,
        experiencePoints: xp, hitDice: { total: entries.reduce((s, e) => s + e.level, 0), die: "d10", spent: 0 },
        spellcasting: Prisma.JsonNull, resources: resourcesWith(advancements),
        classEntries: { create: entries.map((e) => ({ ...e, classId: classIds[e.name] })) },
      },
    });
  }

  it("removes a Paladin's Fighting Style feat when it drops below level 2", async () => {
    await create("fsr-pal21", [{ name: "Paladin", position: 0, level: 2 }], XP_L2, [fsFeat()]);
    const res = await postXp("fsr-pal21", { operations: [{ type: "set", value: XP_L1 }] });
    expect(res.status).toBe(200);
    expect(res.body.advancements.some((a: { slot?: string }) => a.slot === "fightingStyle")).toBe(false);
    const act = await getActivity("fsr-pal21");
    expect(act.body.some((e: { type: string }) => e.type === "advancementsReconciled")).toBe(true);
  });

  it("trims the ASI partition on level-down while keeping the fs feat and origin feats", async () => {
    const asi = { id: "asi-x", level: 4, kind: "asi" as const, abilityDeltas: { strength: 2 }, hpDelta: 0, initDelta: 0 };
    const origin = { id: "origin-x", level: 1, kind: "feat" as const, origin: true as const, abilityDeltas: {}, hpDelta: 0, initDelta: 0, featName: "Tough", featDescription: "o", improvements: [] };
    await create("fsr-pal42", [{ name: "Paladin", position: 0, level: 4 }], XP_L4, [origin, asi, fsFeat()]);
    const res = await postXp("fsr-pal42", { operations: [{ type: "set", value: XP_L2 }] });
    expect(res.status).toBe(200);
    const adv = res.body.advancements as { kind: string; slot?: string; origin?: boolean }[];
    expect(adv.some((a) => a.kind === "asi")).toBe(false);
    expect(adv.some((a) => a.slot === "fightingStyle")).toBe(true);
    expect(adv.some((a) => a.origin)).toBe(true);
  });

  it("removes the fs feat when the multiclass Fighter entry vanishes on level-down", async () => {
    await create("fsr-mc", [
      { name: "Wizard", position: 0, level: 4 },
      { name: "Fighter", position: 1, level: 1 },
    ], XP_L5, [fsFeat()]);
    const res = await postXp("fsr-mc", { operations: [{ type: "set", value: XP_L4 }] });
    expect(res.status).toBe(200);
    expect(res.body.advancements.some((a: { slot?: string }) => a.slot === "fightingStyle")).toBe(false);
  });
});

// At exhaustion 4+ (PHB'14 p. 291), any write site lowering hp.max must clamp current against the EFFECTIVE (halved) max, not the raw column.
describe("POST /api/characters/:id/experience — level-down HP clamps to the exhaustion-halved effective max (#1321)", () => {
  const XP_L1 = 0, XP_L3 = 900, XP_L4 = 2700, XP_L5 = 6500;

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: "ExhLevelDown" } } });
  });

  it("XP drop reverses HP level-ups (no levelUp event, average fallback) and clamps current to the halved max, not the raw one", async () => {
    // No levelUp CharacterEvent rows exist, so revertLevelUps falls back to fixedAverageForDie(10)+conMod per reversed level.
    await prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
        id: "eld-fallback",
        name: "ExhLevelDown fallback",
        rulesEdition: "EDITION_2014",
        experiencePoints: XP_L5, // level 5 → hitDice.total 5 matches, no pending
        hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 5, die: "d10", spent: 0 },
        conditions: { active: [], exhaustion: 4 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "fighter", position: 0, level: 5 }] },
      },
    });

    const res = await postXp("eld-fallback", { operations: [{ type: "set", value: XP_L3 }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.max).toBe(24);
    expect(res.body.hitPoints.current).toBe(24);

    const row = await prisma.character.findUniqueOrThrow({ where: { id: "eld-fallback" }, select: { hitPoints: true } });
    const raw = row.hitPoints as { max: number; current: number };
    expect(raw.max).toBe(48);
    expect(raw.current).toBe(24); // NOT 48 — clamped to the effective max
  });

  it("reconcileAdvancements: removing an over-cap ASI on level-down clamps current to the halved max", async () => {
    const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
    // hpDelta is arbitrary but large enough to make the raw-vs-effective clamp difference unambiguous.
    const asi = { id: "eld-asi", level: 4, kind: "asi" as const, abilityDeltas: { constitution: 2 }, hpDelta: 20, initDelta: 0 };
    await prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
        id: "eld-asi-recon",
        name: "ExhLevelDown asi-recon",
        rulesEdition: "EDITION_2014",
        // The advancement slot cap resolves off the XP-derived level, not hitDice.total — this isolates the test to reconcileAdvancements's clamp, not revertLevelUps'.
        experiencePoints: XP_L4,
        hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 1, die: "d10", spent: 0 },
        conditions: { active: [], exhaustion: 4 },
        resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: [], choicesKnown: {}, advancements: [asi], fightingStyle: null } as unknown as Prisma.InputJsonValue,
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "Fighter", position: 0, level: 1, classId: fighter.id }] },
      },
    });

    const res = await postXp("eld-asi-recon", { operations: [{ type: "set", value: XP_L1 }] });
    expect(res.status).toBe(200);
    expect(res.body.advancements.some((a: { kind: string }) => a.kind === "asi")).toBe(false);
    expect(res.body.hitPoints.max).toBe(10);
    expect(res.body.hitPoints.current).toBe(10);

    const row = await prisma.character.findUniqueOrThrow({ where: { id: "eld-asi-recon" }, select: { hitPoints: true } });
    const raw = row.hitPoints as { max: number; current: number };
    expect(raw.max).toBe(20);
    expect(raw.current).toBe(10); // NOT 20 — clamped to the effective max
  });
});
