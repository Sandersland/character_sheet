/**
 * Characterization lock for the level-gated reconcilers (#617).
 *
 * Asserts the EXACT bytes (summary strings, event `data`, and before/after
 * `resources` payloads) that maneuvers/disciplines/tool-proficiency
 * reconciliation emits on the current code, so the `reconcileKnownList` helper
 * extraction is provably byte-identical. It is the byte-parity oracle for that
 * refactor: it must be green now and stay green — UNEDITED — after the three
 * reconcilers become thin configs over the shared helper.
 *
 * Two payload SHAPES are deliberately locked because they currently differ:
 *   - maneuvers & toolProfs → hand-built 4-key
 *       { used, maneuversKnown, disciplinesKnown, toolProficienciesKnown }
 *   - disciplines           → full serializeResourcesState blob (6 keys, adds
 *       advancements + fightingStyle)
 * Preserving this divergence is intentional; unifying it is a separate,
 * out-of-scope payload change (see #617).
 *
 * Also locks the registry ORDER interaction: reconcileManeuvers runs before
 * reconcileToolProficiencies, so in a full subclass-clear the tool-prof event's
 * `before.maneuversKnown` is already [] (maneuvers trimmed first).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../../app.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { ensureTestOwner } from "../../../test-support/owner.js";
import { authCookie } from "../../../test-support/auth.js";

const OWNER_ID = "owner-levelrecon-char";
let COOKIE: string;
const app = createApp();

// XP thresholds (levelForExperience): L1=0, L3=900, L6=14000, L7=23000, L17=225000.
const XP_LVL_1 = 0;
const XP_LVL_3 = 900;
const XP_LVL_6 = 14000;
const XP_LVL_7 = 23000;
const XP_LVL_17 = 225000;

// Unique catalog names so we never collide with seeded rows.
const FIGHTER_CLASS_NAME = "Test Fighter (Recon Char Suite)";
const BM_SUBCLASS_NAME = "battle master"; // exact lowercase key deriveResources reads
const MONK_CLASS_NAME = "Test Monk (Recon Char Suite)";
const FE_SUBCLASS_NAME = "way of the four elements"; // exact lowercase key

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

// ── Seed lists (normalizeResourcesMutable passes array entries through
//    UNCHANGED, so these exact objects are what appears in before/after). ──
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
function fourDisciplines() {
  return [
    { id: "d1", name: "Fangs of the Fire Snake", description: "Reach + fire damage.", learnedAtLevel: 3, lastSwapLevel: null },
    { id: "d2", name: "Water Whip", description: "Pull or knock prone.", learnedAtLevel: 6, lastSwapLevel: null },
    { id: "d3", name: "Fist of Unbroken Air", description: "Push and knock prone.", learnedAtLevel: 11, lastSwapLevel: null },
    { id: "d4", name: "Rush of the Gale Spirits", description: "Cast Gust of Wind.", learnedAtLevel: 17, lastSwapLevel: null },
  ];
}

async function postXp(characterId: string, body: object) {
  return supertest(app).post(`/api/characters/${characterId}/experience`).set("Cookie", COOKIE).send(body);
}

// Raw event rows (not the serialized activity feed) so before/after are byte-exact.
async function eventsByType(characterId: string, type: string) {
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
let monkClassId: string;
let feSubclassId: string;

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
  const bm = await prisma.subclass.upsert({
    where: { classId_name: { classId: fighter.id, name: BM_SUBCLASS_NAME } },
    create: { classId: fighter.id, name: BM_SUBCLASS_NAME, description: "Maneuvers + Student of War." },
    update: {},
  });
  bmSubclassId = bm.id;

  const monk = await prisma.characterClass.upsert({
    where: { name: MONK_CLASS_NAME },
    create: {
      name: MONK_CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"],
      skillChoiceCount: 2, skillChoices: ["acrobatics"], isSpellcaster: false, subclassLevel: 3,
    },
    update: { subclassLevel: 3 },
  });
  monkClassId = monk.id;
  const fe = await prisma.subclass.upsert({
    where: { classId_name: { classId: monk.id, name: FE_SUBCLASS_NAME } },
    create: { classId: monk.id, name: FE_SUBCLASS_NAME, description: "Elemental disciplines." },
    update: {},
  });
  feSubclassId = fe.id;
});

afterAll(async () => {
  await prisma.subclass.deleteMany({ where: { name: { in: [BM_SUBCLASS_NAME, FE_SUBCLASS_NAME] } } });
  await prisma.characterClass.deleteMany({ where: { name: { in: [FIGHTER_CLASS_NAME, MONK_CLASS_NAME] } } });
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

async function createFourElementsMonk(id: string) {
  return prisma.character.create({
    data: {
      ...BASE_CHARACTER,
      ownerId: OWNER_ID,
      id,
      name: `ReconChar ${id}`,
      experiencePoints: XP_LVL_17,
      hitPoints: { current: 100, max: 100, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 17, die: "d8", spent: 0 },
      spellcasting: Prisma.JsonNull,
      resources: { used: {}, disciplinesKnown: fourDisciplines() },
      classEntries: {
        create: [{ name: MONK_CLASS_NAME, classId: monkClassId, position: 0, level: 17, subclassId: feSubclassId, subclass: FE_SUBCLASS_NAME }],
      },
    },
  });
}

describe("level-reconciliation characterization (#617)", () => {
  // ── maneuvers: partial trim (subclass retained) — 4-key payload ──────────────
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
        disciplinesKnown: [],
        toolProficienciesKnown: oneToolProf(),
      },
    });
    expect(ev.after).toEqual({
      resources: {
        used: {},
        maneuversKnown: fiveManeuvers().slice(0, 3),
        disciplinesKnown: [],
        toolProficienciesKnown: oneToolProf(),
      },
    });
    // Tool profs untouched at level 3 (Student of War still grants 1).
    expect(await eventsByType("recon-man-partial", "toolProficienciesReconciled")).toHaveLength(0);
  });

  // ── maneuvers + toolProfs: full clear (subclass removed) + registry order ────
  it("maneuvers then toolProfs full-clear on level 7→1, in registry order", async () => {
    await createBattleMaster("recon-full");
    const res = await postXp("recon-full", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);

    const [man] = await eventsByType("recon-full", "maneuversReconciled");
    expect(man.summary).toBe("All 5 maneuvers removed — subclass no longer available");
    expect(man.data).toEqual({ removedCount: 5, allowed: 0 });
    expect(man.before).toEqual({
      resources: { used: {}, maneuversKnown: fiveManeuvers(), disciplinesKnown: [], toolProficienciesKnown: oneToolProf() },
    });
    expect(man.after).toEqual({
      resources: { used: {}, maneuversKnown: [], disciplinesKnown: [], toolProficienciesKnown: oneToolProf() },
    });

    const [tool] = await eventsByType("recon-full", "toolProficienciesReconciled");
    expect(tool.category).toBe("resources");
    expect(tool.summary).toBe("1 tool proficiency choice removed — subclass no longer available");
    expect(tool.data).toEqual({ removedCount: 1, allowed: 0 });
    // Ordering interaction: maneuvers already trimmed → maneuversKnown is [] here.
    expect(tool.before).toEqual({
      resources: { used: {}, maneuversKnown: [], disciplinesKnown: [], toolProficienciesKnown: oneToolProf() },
    });
    expect(tool.after).toEqual({
      resources: { used: {}, maneuversKnown: [], disciplinesKnown: [], toolProficienciesKnown: [] },
    });

    // Registry order: maneuvers event precedes toolProfs event within the batch.
    const evs = await allEvents("recon-full");
    const manIdx = evs.findIndex((e) => e.type === "maneuversReconciled");
    const toolIdx = evs.findIndex((e) => e.type === "toolProficienciesReconciled");
    expect(manIdx).toBeGreaterThanOrEqual(0);
    expect(toolIdx).toBeGreaterThan(manIdx);
    // Both share the XP op's batch.
    expect(man.batchId).toBe(tool.batchId);
    expect(man.batchId).toBeTruthy();
  });

  // ── disciplines: partial trim — full serializeResourcesState blob (6 keys) ───
  it("disciplinesReconciled: partial trim 4→2 on level 17→6, full-blob payload", async () => {
    await createFourElementsMonk("recon-disc-partial");
    const res = await postXp("recon-disc-partial", { operations: [{ type: "set", value: XP_LVL_6 }] });
    expect(res.status).toBe(200);

    const [ev] = await eventsByType("recon-disc-partial", "disciplinesReconciled");
    expect(ev.category).toBe("resources");
    expect(ev.summary).toBe("2 elemental disciplines removed — level cap reduced to 2");
    expect(ev.data).toEqual({ removedCount: 2, allowed: 2 });
    // Full blob: includes advancements + fightingStyle (the shape divergence #617 preserves).
    expect(ev.before).toEqual({
      resources: {
        used: {},
        maneuversKnown: [],
        disciplinesKnown: fourDisciplines(),
        toolProficienciesKnown: [],
        advancements: [],
        fightingStyle: null,
      },
    });
    expect(ev.after).toEqual({
      resources: {
        used: {},
        maneuversKnown: [],
        disciplinesKnown: fourDisciplines().slice(0, 2),
        toolProficienciesKnown: [],
        advancements: [],
        fightingStyle: null,
      },
    });
  });

  // ── disciplines: full clear (subclass removed) ───────────────────────────────
  it("disciplinesReconciled: full clear on level 17→1", async () => {
    await createFourElementsMonk("recon-disc-full");
    const res = await postXp("recon-disc-full", { operations: [{ type: "set", value: XP_LVL_1 }] });
    expect(res.status).toBe(200);

    const [ev] = await eventsByType("recon-disc-full", "disciplinesReconciled");
    expect(ev.summary).toBe("All 4 elemental disciplines removed — subclass no longer available");
    expect(ev.data).toEqual({ removedCount: 4, allowed: 0 });
    expect(ev.after).toEqual({
      resources: {
        used: {},
        maneuversKnown: [],
        disciplinesKnown: [],
        toolProficienciesKnown: [],
        advancements: [],
        fightingStyle: null,
      },
    });
  });
});
