// Every reconciler snapshots the same canonical resources shape via snapshotResources() (#617); an omitted key here wipes on wholesale revert.
// Registry order: reconcileManeuvers runs before reconcileToolProficiencies.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
import { battleMasterResourceRowsData } from "@/test-support/fighter-resource-rows.js";

const OWNER_ID = "owner-levelrecon-char";
let COOKIE: string;

const XP_LVL_1 = 0;
const XP_LVL_3 = 900;
const XP_LVL_5 = 6500;
const XP_LVL_6 = 14000;
const XP_LVL_7 = 23000;
const XP_LVL_17 = 225000;

const FIGHTER_CLASS_NAME = "Test Fighter (Recon Char Suite)";
const BM_SUBCLASS_NAME = "battle master"; // exact lowercase key deriveResources reads

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10,
};
const BASE_CHARACTER = {
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  abilityScores: BASE_ABILITY_SCORES,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

// normalizeResourcesMutable passes array entries through unchanged, so these exact objects are what appears in before/after.
function fiveManeuvers() {
  return [
    { id: "m1", name: "Disarming Attack", description: "Force target to drop." },
    { id: "m2", name: "Riposte", description: "Counter when enemy misses." },
    { id: "m3", name: "Trip Attack", description: "Knock target prone." },
    { id: "m4", name: "Sweeping Attack", description: "Hit adjacent foe." },
    { id: "m5", name: "Menacing Attack", description: "Frighten the target." },
  ];
}
function oneToolProf() {
  return [{ id: "tp1", name: "Smith's Tools" }];
}

async function postXp(characterId: string, body: object) {
  return supertest(app).post(`/api/characters/${characterId}/experience`).set("Cookie", COOKIE).send(body);
}

type ReconEventType =
  | "maneuversReconciled"
  | "toolProficienciesReconciled"
  | "advancementsReconciled";
async function eventsByType(characterId: string, type: ReconEventType) {
  return prisma.characterEvent.findMany({
    where: { characterId, type },
    orderBy: { createdAt: "asc" as const },
  });
}
async function allEvents(characterId: string) {
  return prisma.characterEvent.findMany({
    where: { characterId },
    orderBy: { createdAt: "asc" as const },
  });
}

let fighterClassId: string;
let bmSubclassId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);

  const fighter = await prisma.characterClass.upsert({
    where: { name: FIGHTER_CLASS_NAME },
    create: {
      name: FIGHTER_CLASS_NAME, hitDie: "d10", savingThrows: ["strength", "constitution"],
      skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false, subclassLevel: 3,
    },
    update: { subclassLevel: 3 },
  });
  fighterClassId = fighter.id;
  const bm = await upsertEditionRow(
    prisma.subclass,
    { classId: fighter.id, name: BM_SUBCLASS_NAME, edition: null },
    // (slug, edition) is unique catalog-wide regardless of classId (#1277) — distinct from the real seeded "fighter-battle-master".
    { classId: fighter.id, name: BM_SUBCLASS_NAME, description: "Maneuvers + Student of War.", slug: "fighter-battle-master-reconciliation-test" },
    {},
  );
  bmSubclassId = bm.id;
  // battleMasterResourceRowsData must seed ClassFeature rows maneuverChoiceCount/toolProfChoiceCount for the assertions below to resolve (#1532).
  await prisma.classFeature.deleteMany({ where: { subclassId: bmSubclassId } });
  await prisma.classFeature.createMany({ data: battleMasterResourceRowsData(fighterClassId, bmSubclassId) });
});

afterAll(async () => {
  await prisma.subclass.deleteMany({ where: { name: { in: [BM_SUBCLASS_NAME] } } });
  await prisma.characterClass.deleteMany({ where: { name: { in: [FIGHTER_CLASS_NAME] } } });
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "ReconChar" } } });
});

async function createBattleMaster(id: string) {
  return prisma.character.create({
    data: {
      ...BASE_CHARACTER,
      ownerId: OWNER_ID,
      id,
      name: `ReconChar ${id}`,
      experiencePoints: XP_LVL_7,
      hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 7, die: "d10", spent: 0 },
      spellcasting: Prisma.JsonNull,
      resources: { used: {}, maneuversKnown: fiveManeuvers(), toolProficienciesKnown: oneToolProf() },
      classEntries: {
        create: [{ name: FIGHTER_CLASS_NAME, classId: fighterClassId, position: 0, level: 7, subclassId: bmSubclassId, subclass: BM_SUBCLASS_NAME }],
      },
    },
  });
}

// Homebrew class name, so advancementSlotsForLevel falls back to the base 5-slot schedule [4,8,12,16,19].
function twoAdvancements() {
  return [
    { id: "adv-asi-str", level: 4, kind: "asi" as const, abilityDeltas: { strength: 2 }, hpDelta: 0, initDelta: 0 },
    { id: "adv-feat-init", level: 8, kind: "feat" as const, featName: "Test Alertness", abilityDeltas: { dexterity: 2 }, hpDelta: 0, initDelta: 1 },
  ];
}

async function createAdvancedFighter(id: string) {
  return prisma.character.create({
    data: {
      ...BASE_CHARACTER,
      ownerId: OWNER_ID,
      id,
      name: `ReconChar ${id}`,
      abilityScores: { ...BASE_ABILITY_SCORES, strength: 12, dexterity: 12 },
      initiativeBonus: 1,
      experiencePoints: XP_LVL_17,
      hitPoints: { current: 100, max: 100, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 17, die: "d10", spent: 0 },
      spellcasting: Prisma.JsonNull,
      resources: { used: {}, advancements: twoAdvancements() },
      classEntries: {
        create: [{ name: FIGHTER_CLASS_NAME, classId: fighterClassId, position: 0, level: 17 }],
      },
    },
  });
}

describe("level-reconciliation characterization (#617)", () => {
  it("maneuversReconciled: partial trim 5→3 on level 7→3", async () => {
    await createBattleMaster("recon-man-partial");
    const res = await postXp("recon-man-partial", { operations: [{ type: "set", value: XP_LVL_3 }] });
    expect(res.status).toBe(200);

    const [ev] = await eventsByType("recon-man-partial", "maneuversReconciled");
    expect(ev.category).toBe("resources");
    expect(ev.summary).toBe("2 maneuvers removed — level cap reduced to 3");
    expect(ev.data).toEqual({ removedCount: 2, allowed: 3 });
    expect(ev.before).toEqual({
      resources: {
        used: {},
        maneuversKnown: fiveManeuvers(),
        toolProficienciesKnown: oneToolProf(),
        expertiseKnown: [],
        choicesKnown: {},
        advancements: [],
      },
    });
    expect(ev.after).toEqual({
      resources: {
        used: {},
        maneuversKnown: fiveManeuvers().slice(0, 3),
        toolProficienciesKnown: oneToolProf(),
        expertiseKnown: [],
        choicesKnown: {},
        advancements: [],
      },
    });
    expect(await eventsByType("recon-man-partial", "toolProficienciesReconciled")).toHaveLength(0);
  });

  it("maneuvers then toolProfs full-clear on level 7→1, in registry order", async () => {
    await createBattleMaster("recon-full");
    const res = await postXp("recon-full", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);

    const [man] = await eventsByType("recon-full", "maneuversReconciled");
    expect(man.summary).toBe("All 5 maneuvers removed — subclass no longer available");
    expect(man.data).toEqual({ removedCount: 5, allowed: 0 });
    expect(man.before).toEqual({
      resources: { used: {}, maneuversKnown: fiveManeuvers(), toolProficienciesKnown: oneToolProf(), expertiseKnown: [], choicesKnown: {}, advancements: [] },
    });
    expect(man.after).toEqual({
      resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: oneToolProf(), expertiseKnown: [], choicesKnown: {}, advancements: [] },
    });

    const [tool] = await eventsByType("recon-full", "toolProficienciesReconciled");
    expect(tool.category).toBe("resources");
    expect(tool.summary).toBe("1 tool proficiency choice removed — subclass no longer available");
    expect(tool.data).toEqual({ removedCount: 1, allowed: 0 });
    expect(tool.before).toEqual({
      resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: oneToolProf(), expertiseKnown: [], choicesKnown: {}, advancements: [] },
    });
    expect(tool.after).toEqual({
      resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: [], expertiseKnown: [], choicesKnown: {}, advancements: [] },
    });

    const evs = await allEvents("recon-full");
    const manIdx = evs.findIndex((e) => e.type === "maneuversReconciled");
    const toolIdx = evs.findIndex((e) => e.type === "toolProficienciesReconciled");
    expect(manIdx).toBeGreaterThanOrEqual(0);
    expect(toolIdx).toBeGreaterThan(manIdx);
    expect(man.batchId).toBe(tool.batchId);
    expect(man.batchId).toBeTruthy();
  });

  it("advancementsReconciled: partial trim 2→1 on level 17→6", async () => {
    await createAdvancedFighter("recon-adv-partial");
    const res = await postXp("recon-adv-partial", { operations: [{ type: "set", value: XP_LVL_6 }] });
    expect(res.status).toBe(200);

    const [ev] = await eventsByType("recon-adv-partial", "advancementsReconciled");
    expect(ev.category).toBe("advancement");
    expect(ev.summary).toBe("1 advancement removed — level cap reduced to 1 (removed: Test Alertness)");
    expect(ev.data).toEqual({ removedCount: 1, allowed: 1 });

    const before = ev.before as { abilityScores: Record<string, number>; initiativeBonus: number; resources: { advancements: unknown[] } };
    const after = ev.after as { abilityScores: Record<string, number>; initiativeBonus: number; resources: { advancements: unknown[] } };
    expect(before.abilityScores).toMatchObject({ strength: 12, dexterity: 12 });
    expect(before.initiativeBonus).toBe(1);
    expect(before.resources.advancements).toEqual(twoAdvancements());
    expect(after.abilityScores).toMatchObject({ strength: 12, dexterity: 10 });
    expect(after.initiativeBonus).toBe(0);
    expect(after.resources.advancements).toEqual(twoAdvancements().slice(0, 1));
  });

  it("advancementsReconciled: full clear on level 17→3 (below first ASI)", async () => {
    await createAdvancedFighter("recon-adv-full");
    const res = await postXp("recon-adv-full", { operations: [{ type: "set", value: XP_LVL_3 }] });
    expect(res.status).toBe(200);

    const [ev] = await eventsByType("recon-adv-full", "advancementsReconciled");
    expect(ev.summary).toBe("2 advancements removed — level dropped below first ASI level");
    expect(ev.data).toEqual({ removedCount: 2, allowed: 0 });

    const after = ev.after as { abilityScores: Record<string, number>; initiativeBonus: number; resources: { advancements: unknown[] } };
    expect(after.abilityScores).toMatchObject({ strength: 10, dexterity: 10 });
    expect(after.initiativeBonus).toBe(0);
    expect(after.resources.advancements).toEqual([]);
  });
});

// Prepared cap is a per-class table count; a level-down trims over-cap prepared spells to the new limit, oldest kept (#1127).
function sixPreparedWarlockSpells() {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `wl-spell-${i + 1}`,
    name: `Warlock Spell ${i + 1}`,
    level: 1,
    school: "evocation",
    prepared: true,
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "Placeholder.",
  }));
}

async function revertBatchRoute(characterId: string, batchId: string) {
  return supertest(app).post(`/api/characters/${characterId}/events/${batchId}/revert`).set("Cookie", COOKIE).send({});
}

describe("prepared-spell reconciliation (#1127)", () => {
  let warlockClassId: string;

  beforeAll(async () => {
    warlockClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Warlock" } })).id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: "ReconPrep" } } });
  });

  async function createWarlock(id: string) {
    return prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
        id,
        name: `ReconPrep ${id}`,
        experiencePoints: XP_LVL_5,
        hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 5, die: "d8", spent: 0 },
        abilityScores: { ...BASE_ABILITY_SCORES, charisma: 16 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, concentratingOn: null, spells: sixPreparedWarlockSpells() },
        classEntries: { create: [{ name: "warlock", classId: warlockClassId, position: 0, level: 5 }] },
      },
    });
  }

  it("trims 6 prepared → 4 on Warlock 5→3, oldest kept, one unprepareSpell event", async () => {
    await createWarlock("recon-prep");
    const res = await postXp("recon-prep", { operations: [{ type: "set", value: XP_LVL_3 }] });
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.preparedSpellLimit).toBe(4);
    expect(res.body.spellcasting.preparedSpellCount).toBe(4);

    const [ev] = await eventsByType("recon-prep", "unprepareSpell" as ReconEventType);
    expect(ev.category).toBe("spellcasting");
    expect(ev.data).toMatchObject({ trimmedCount: 2, limit: 4 });
    const before = ev.before as { spellcasting: { spells: Array<{ id: string; prepared: boolean }> } };
    const after = ev.after as { spellcasting: { spells: Array<{ id: string; prepared: boolean }> } };
    expect(before.spellcasting.spells.filter((s) => s.prepared)).toHaveLength(6);
    expect(after.spellcasting.spells.filter((s) => s.prepared).map((s) => s.id)).toEqual(
      ["wl-spell-1", "wl-spell-2", "wl-spell-3", "wl-spell-4"],
    );
    expect(after.spellcasting.spells).toHaveLength(6);
  });

  it("a revert restores all 6 prepared", async () => {
    await createWarlock("recon-prep-undo");
    await postXp("recon-prep-undo", { operations: [{ type: "set", value: XP_LVL_3 }] });
    const batchId = (await eventsByType("recon-prep-undo", "unprepareSpell" as ReconEventType))[0].batchId!;
    const res = await revertBatchRoute("recon-prep-undo", batchId);
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.preparedSpellCount).toBe(6);
  });
});

// reconcilePreparedSpells (write) and buildSpellcastingView's clamp-on-read (read) both resolve through derivePreparedSpellLimit, so a 2014 Bard's cap agrees on both sides by construction (#1507).
function eightKnownBardSpells() {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `bard-spell-${i + 1}`,
    name: `Bard Spell ${i + 1}`,
    level: 1,
    school: "enchantment",
    prepared: true,
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "Placeholder.",
  }));
}

describe("prepared-spell reconciliation — 2014 known caster (#1507)", () => {
  const XP_LVL_4 = 2700;
  let bardClassId: string;

  beforeAll(async () => {
    bardClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Bard" } })).id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: "ReconBard2014" } } });
  });

  async function createBard2014(id: string, level: 4 | 5) {
    return prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
        id,
        name: `ReconBard2014 ${id}`,
        rulesEdition: "EDITION_2014",
        experiencePoints: level === 5 ? XP_LVL_5 : XP_LVL_4,
        hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: level, die: "d8", spent: 0 },
        abilityScores: { ...BASE_ABILITY_SCORES, charisma: 16 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, concentratingOn: null, spells: eightKnownBardSpells() },
        classEntries: { create: [{ name: "bard", classId: bardClassId, position: 0, level }] },
      },
    });
  }

  it("write-side: reconcilePreparedSpells trims 8 prepared -> 7 on Bard 5->4, one unprepareSpell event naming the new cap", async () => {
    await createBard2014("recon-bard-write", 5);
    const res = await postXp("recon-bard-write", { operations: [{ type: "set", value: XP_LVL_4 }] });
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.preparedSpellLimit).toBe(7);
    expect(res.body.spellcasting.preparedSpellCount).toBe(7);

    const [ev] = await eventsByType("recon-bard-write", "unprepareSpell" as ReconEventType);
    expect(ev.category).toBe("spellcasting");
    expect(ev.summary).toBe("1 prepared spell unprepared — level cap reduced to 7");
    expect(ev.data).toMatchObject({ trimmedCount: 1, limit: 7 });
    const before = ev.before as { spellcasting: { spells: Array<{ id: string; prepared: boolean }> } };
    const after = ev.after as { spellcasting: { spells: Array<{ id: string; prepared: boolean }> } };
    expect(before.spellcasting.spells.filter((s) => s.prepared)).toHaveLength(8);
    expect(after.spellcasting.spells.filter((s) => s.prepared)).toHaveLength(7);
  });

  it("read-side: buildSpellcastingView clamps an over-cap blob written directly (no XP op, reconciler never runs) to the same 7", async () => {
    await createBard2014("recon-bard-read", 4);
    const res = await supertest(app).get("/api/characters/recon-bard-read").set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.preparedSpellLimit).toBe(7);
    expect(res.body.spellcasting.preparedSpellCount).toBe(7);
    expect(await eventsByType("recon-bard-read", "unprepareSpell" as ReconEventType)).toHaveLength(0);
  });
});

// reconcilePreparedSpells and buildSpellcastingView's clamp-on-read both resolve the Eldritch Knight third-caster cap through derivePreparedSpellLimit (#1531); a reconciler missing `subclassRef` would still pass on served count alone, so the write-side test checks the PERSISTED event.
function thirteenPreparedEldritchKnightSpells() {
  return Array.from({ length: 13 }, (_, i) => ({
    id: `ek-spell-${i + 1}`,
    name: `Eldritch Knight Spell ${i + 1}`,
    level: 1,
    school: "abjuration",
    prepared: true,
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "Placeholder.",
  }));
}

describe("prepared-spell reconciliation — Eldritch Knight third caster (#1531)", () => {
  // THIRD_CASTER_PREPARED[4-3]=4 and [20-3]=13 (spellcasting-tables.ts) are the source of these level constants.
  const XP_LVL_4 = 2700;
  const XP_LVL_20 = 355000;
  let fighterClassId: string;
  let eldritchKnightSubclassId: string;

  beforeAll(async () => {
    fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } })).id;
    eldritchKnightSubclassId = (await prisma.subclass.findFirstOrThrow({ where: { slug: "fighter-eldritch-knight" } })).id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { name: { startsWith: "ReconEK" } } });
  });

  async function createEldritchKnight(id: string, level: 4 | 20) {
    return prisma.character.create({
      data: {
        ...BASE_CHARACTER,
        ownerId: OWNER_ID,
        id,
        name: `ReconEK ${id}`,
        experiencePoints: level === 20 ? XP_LVL_20 : XP_LVL_4,
        hitPoints: { current: 100, max: 100, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: level, die: "d10", spent: 0 },
        abilityScores: { ...BASE_ABILITY_SCORES, intelligence: 16 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, concentratingOn: null, spells: thirteenPreparedEldritchKnightSpells() },
        classEntries: {
          create: [{
            name: "fighter",
            classId: fighterClassId,
            subclass: "Eldritch Knight",
            subclassId: eldritchKnightSubclassId,
            position: 0,
            level,
          }],
        },
      },
    });
  }

  it("write-side: reconcilePreparedSpells trims 13 prepared -> 4 on Fighter/EK 20->4, one unprepareSpell event naming the new cap", async () => {
    await createEldritchKnight("recon-ek-write", 20);
    const res = await postXp("recon-ek-write", { operations: [{ type: "set", value: XP_LVL_4 }] });
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.preparedSpellLimit).toBe(4);
    expect(res.body.spellcasting.preparedSpellCount).toBe(4);

    const [ev] = await eventsByType("recon-ek-write", "unprepareSpell" as ReconEventType);
    expect(ev.category).toBe("spellcasting");
    expect(ev.data).toMatchObject({ trimmedCount: 9, limit: 4 });
    const before = ev.before as { spellcasting: { spells: Array<{ id: string; prepared: boolean }> } };
    const after = ev.after as { spellcasting: { spells: Array<{ id: string; prepared: boolean }> } };
    expect(before.spellcasting.spells.filter((s) => s.prepared)).toHaveLength(13);
    expect(after.spellcasting.spells.filter((s) => s.prepared)).toHaveLength(4);

    // Persisted, not just served — proves the reconciler wrote the trim, not just the read-side clamp.
    const persisted = await prisma.character.findUniqueOrThrow({ where: { id: "recon-ek-write" } });
    const persistedSpells = (persisted.spellcasting as { spells: Array<{ prepared: boolean }> }).spells;
    expect(persistedSpells.filter((s) => s.prepared)).toHaveLength(4);
  });

  it("read-side: buildSpellcastingView clamps an over-cap blob written directly (no XP op, reconciler never runs) to the same 4", async () => {
    await createEldritchKnight("recon-ek-read", 4);
    const res = await supertest(app).get("/api/characters/recon-ek-read").set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.preparedSpellLimit).toBe(4);
    expect(res.body.spellcasting.preparedSpellCount).toBe(4);
    expect(await eventsByType("recon-ek-read", "unprepareSpell" as ReconEventType)).toHaveLength(0);
  });
});
