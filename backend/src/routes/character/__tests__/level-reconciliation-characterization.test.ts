/**
 * Characterization lock for the level-gated reconcilers (#617).
 *
 * Asserts the EXACT bytes (summary strings, event `data`, and before/after
 * `resources` payloads) that maneuvers/tool-proficiency reconciliation emits.
 *
 * Since #818 every reconciler snapshots the SAME canonical resources shape
 * via snapshotResources(): { used, maneuversKnown,
 * toolProficienciesKnown, advancements, fightingStyle }. The former per-site
 * divergence (maneuvers/toolProfs emitted a partial 4-key object) was an
 * undo-correctness bug — an omitted key wiped on wholesale revert — now fixed.
 *
 * Also locks the registry ORDER interaction: reconcileManeuvers runs before
 * reconcileToolProficiencies, so in a full subclass-clear the tool-prof event's
 * `before.maneuversKnown` is already [] (maneuvers trimmed first).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-levelrecon-char";
let COOKIE: string;
const app = createApp();

// XP thresholds (levelForExperience): L1=0, L3=900, L6=14000, L7=23000, L17=225000.
const XP_LVL_1 = 0;
const XP_LVL_3 = 900;
const XP_LVL_5 = 6500;
const XP_LVL_6 = 14000;
const XP_LVL_7 = 23000;
const XP_LVL_17 = 225000;

// Unique catalog names so we never collide with seeded rows.
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

async function postXp(characterId: string, body: object) {
  return supertest(app).post(`/api/characters/${characterId}/experience`).set("Cookie", COOKIE).send(body);
}

// Raw event rows (not the serialized activity feed) so before/after are byte-exact.
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
  const bm = await prisma.subclass.upsert({
    where: { classId_name: { classId: fighter.id, name: BM_SUBCLASS_NAME } },
    create: { classId: fighter.id, name: BM_SUBCLASS_NAME, description: "Maneuvers + Student of War." },
    update: {},
  });
  bmSubclassId = bm.id;
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

// Two ASI/feat advancements with pure ability + init deltas (hpDelta 0), so the
// reversal touches abilityScores + initiativeBonus — fields no OTHER reconciler
// writes — and their before/after bytes are deterministic even though a
// single-class level-down also recomputes HP in the same batch. The Fighter is
// homebrew-named, so advancementSlotsForLevel uses the base 5-slot schedule
// [4,8,12,16,19]: L17→4 allowed (legal), L6→1, L3→0.
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
      // Scores + init reflect the two advancements already applied.
      abilityScores: { ...BASE_ABILITY_SCORES, strength: 12, dexterity: 12 },
      initiativeBonus: 1,
      experiencePoints: XP_LVL_17,
      hitPoints: { current: 100, max: 100, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 17, die: "d10", spent: 0 },
      spellcasting: Prisma.JsonNull,
      resources: { used: {}, advancements: twoAdvancements() },
      classEntries: {
        // No subclass → no maneuver/tool reconcile noise; only advancements trim.
        create: [{ name: FIGHTER_CLASS_NAME, classId: fighterClassId, position: 0, level: 17 }],
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
        toolProficienciesKnown: oneToolProf(),
        choicesKnown: {},
        advancements: [],
      },
    });
    expect(ev.after).toEqual({
      resources: {
        used: {},
        maneuversKnown: fiveManeuvers().slice(0, 3),
        toolProficienciesKnown: oneToolProf(),
        choicesKnown: {},
        advancements: [],
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
      resources: { used: {}, maneuversKnown: fiveManeuvers(), toolProficienciesKnown: oneToolProf(), choicesKnown: {}, advancements: [] },
    });
    expect(man.after).toEqual({
      resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: oneToolProf(), choicesKnown: {}, advancements: [] },
    });

    const [tool] = await eventsByType("recon-full", "toolProficienciesReconciled");
    expect(tool.category).toBe("resources");
    expect(tool.summary).toBe("1 tool proficiency choice removed — subclass no longer available");
    expect(tool.data).toEqual({ removedCount: 1, allowed: 0 });
    // Ordering interaction: maneuvers already trimmed → maneuversKnown is [] here.
    expect(tool.before).toEqual({
      resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: oneToolProf(), choicesKnown: {}, advancements: [] },
    });
    expect(tool.after).toEqual({
      resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: [], choicesKnown: {}, advancements: [] },
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

  // ── advancements: partial trim (level cap reduced, not below first ASI) ───────
  // Asserts the deterministic fields only: summary/data + the resources.advancements
  // payload + abilityScores/initiativeBonus reversal. HP is intentionally NOT pinned
  // — a single-class level-down recomputes it in the same batch (that coupling is
  // out of scope here; this case exists to lock the advancement-reversal path).
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
    // Before: both advancements present, scores/init reflect them.
    expect(before.abilityScores).toMatchObject({ strength: 12, dexterity: 12 });
    expect(before.initiativeBonus).toBe(1);
    expect(before.resources.advancements).toEqual(twoAdvancements());
    // After: the feat (tail) is reversed — dexterity −2, init −1; strength ASI kept.
    expect(after.abilityScores).toMatchObject({ strength: 12, dexterity: 10 });
    expect(after.initiativeBonus).toBe(0);
    expect(after.resources.advancements).toEqual(twoAdvancements().slice(0, 1));
  });

  // ── advancements: full clear (level dropped below first ASI level) ───────────
  it("advancementsReconciled: full clear on level 17→3 (below first ASI)", async () => {
    await createAdvancedFighter("recon-adv-full");
    const res = await postXp("recon-adv-full", { operations: [{ type: "set", value: XP_LVL_3 }] });
    expect(res.status).toBe(200);

    const [ev] = await eventsByType("recon-adv-full", "advancementsReconciled");
    expect(ev.summary).toBe("2 advancements removed — level dropped below first ASI level");
    expect(ev.data).toEqual({ removedCount: 2, allowed: 0 });

    const after = ev.after as { abilityScores: Record<string, number>; initiativeBonus: number; resources: { advancements: unknown[] } };
    // Both reversed: strength −2, dexterity −2, init −1 → back to base.
    expect(after.abilityScores).toMatchObject({ strength: 10, dexterity: 10 });
    expect(after.initiativeBonus).toBe(0);
    expect(after.resources.advancements).toEqual([]);
  });
});

// ── prepared-spell clamp (#1127): the prepared cap is a per-class table count, so
//    a level-down trims over-cap prepared spells to the new limit (oldest kept). ──
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
        experiencePoints: XP_LVL_5, // Warlock 5 → prepared cap 6 (all 6 legal)
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
    // Warlock 3 prepared cap = 4; over-cap read clamps to exactly 4.
    expect(res.body.spellcasting.preparedSpellLimit).toBe(4);
    expect(res.body.spellcasting.preparedSpellCount).toBe(4);

    const [ev] = await eventsByType("recon-prep", "unprepareSpell" as ReconEventType);
    expect(ev.category).toBe("spellcasting");
    expect(ev.data).toMatchObject({ trimmedCount: 2, limit: 4 });
    const before = ev.before as { spellcasting: { spells: Array<{ id: string; prepared: boolean }> } };
    const after = ev.after as { spellcasting: { spells: Array<{ id: string; prepared: boolean }> } };
    expect(before.spellcasting.spells.filter((s) => s.prepared)).toHaveLength(6);
    // Oldest 4 (first in array order) stay prepared; the last 2 are unprepared.
    expect(after.spellcasting.spells.filter((s) => s.prepared).map((s) => s.id)).toEqual(
      ["wl-spell-1", "wl-spell-2", "wl-spell-3", "wl-spell-4"],
    );
    expect(after.spellcasting.spells).toHaveLength(6); // entries kept, just unprepared
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
