/**
 * Undo-correctness regression for the canonical snapshotResources() helper (#818).
 *
 * Before #818 the maneuvers/tool-prof reconcile snapshots were hand-built 4-key
 * objects that omitted advancements. Because the resources undo branch restores
 * before.resources WHOLESALE, undoing a maneuvers-reconcile event silently wiped
 * a Fighter's advancements (incl. the #1137 Fighting Style feat).
 *
 * This pins the fix: a Battle Master with an ASI AND a Fighting Style feat
 * advancement, leveled 7→6 (maneuvers trimmed 5→3, advancements kept), then
 * undone — both survive the round-trip.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
import { battleMasterResourceRowsData } from "@/test-support/fighter-resource-rows.js";

const OWNER_ID = "owner-snapshot-undo";
let COOKIE: string;

const XP_LVL_6 = 14000;
const XP_LVL_7 = 23000;

const FIGHTER_CATALOG_NAME = "Snapshot Undo Test Fighter";
const BM_SUBCLASS_NAME = "battle master"; // exact lowercase key deriveResources reads

const BASE_CHARACTER = {
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function fiveManeuvers() {
  return [
    { id: "m1", name: "Disarming Attack", description: "Force target to drop." },
    { id: "m2", name: "Riposte", description: "Counter when enemy misses." },
    { id: "m3", name: "Trip Attack", description: "Knock target prone." },
    { id: "m4", name: "Sweeping Attack", description: "Hit adjacent foe." },
    { id: "m5", name: "Menacing Attack", description: "Frighten the target." },
  ];
}

// One ASI (L4) + one Fighting Style feat (#1137) — both kept at level 6.
function twoAdvancements() {
  return [
    { id: "adv-str", level: 4, kind: "asi" as const, abilityDeltas: { strength: 2 }, hpDelta: 0, initDelta: 0 },
    { id: "adv-fs", level: 1, kind: "feat" as const, slot: "fightingStyle" as const, abilityDeltas: {}, hpDelta: 0, initDelta: 0, featName: "Defense", featDescription: "d", improvements: [{ target: "armorClassWhileArmored", amount: 1 }] },
  ];
}

const FIXTURE_ID = "snapshot-undo-bm";
let fighterClassId: string;
let bmSubclassId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  // extraAsiLevels/fightingStyleFeatLevel (#1529): the ASI/fs-slot caps
  // resolve via these columns through the class FK relation now, matching
  // Fighter's real values so twoAdvancements()'s ASI + fs feat both survive
  // the slot-cap clamp exactly as the old className-keyed lookup did.
  const fighter = await prisma.characterClass.upsert({
    where: { name: FIGHTER_CATALOG_NAME },
    create: {
      name: FIGHTER_CATALOG_NAME, hitDie: "d10", savingThrows: ["strength", "constitution"],
      skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false, subclassLevel: 3,
      extraAsiLevels: [6, 14], fightingStyleFeatLevel: 1,
    },
    update: { subclassLevel: 3, extraAsiLevels: [6, 14], fightingStyleFeatLevel: 1 },
  });
  fighterClassId = fighter.id;
  const bm = await upsertEditionRow(
    prisma.subclass,
    { classId: fighter.id, name: BM_SUBCLASS_NAME, edition: null },
    // Distinct from the real seeded "fighter-battle-master" (#1277) — this
    // test's Fighter class is its own throwaway row.
    { classId: fighter.id, name: BM_SUBCLASS_NAME, description: "Maneuvers + Student of War.", slug: "fighter-battle-master-snapshot-undo-test" },
    {},
  );
  bmSubclassId = bm.id;
  // #1546 Part B-i (Ruling 2): shared helper, not a per-file copy.
  await prisma.classFeature.deleteMany({ where: { subclassId: bmSubclassId } });
  await prisma.classFeature.createMany({ data: battleMasterResourceRowsData(fighterClassId, bmSubclassId) });
});

afterAll(async () => {
  await prisma.subclass.deleteMany({ where: { name: BM_SUBCLASS_NAME, classId: fighterClassId } });
  await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CATALOG_NAME } });
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

// The class entry links classId to the real Fighter row above (#1529) so the
// Fighting Style feat slot + advancementSlotsForLevel recognize the Fighter
// schedule — resolution is by FK now, not by the entry's `name`.
async function createBattleMaster() {
  return prisma.character.create({
    data: {
      ...BASE_CHARACTER,
      ownerId: OWNER_ID,
      id: FIXTURE_ID,
      name: "Snapshot Undo Battle Master",
      experiencePoints: XP_LVL_7,
      hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 7, die: "d10", spent: 0 },
      spellcasting: Prisma.JsonNull,
      resources: {
        used: {},
        maneuversKnown: fiveManeuvers(),
        toolProficienciesKnown: [],
        advancements: twoAdvancements(),
      } as unknown as Prisma.InputJsonValue,
      classEntries: {
        create: [{ name: "fighter", classId: fighterClassId, position: 0, level: 7, subclassId: bmSubclassId, subclass: BM_SUBCLASS_NAME }],
      },
    },
  });
}

describe("snapshotResources undo-correctness (#818)", () => {
  it("undoing a maneuvers-reconcile event preserves the fs feat and advancements", async () => {
    await createBattleMaster();
    const hasFs = (advs: Array<{ slot?: string }>) => advs.some((a) => a.slot === "fightingStyle");

    // Level 7 → 6: maneuvers trimmed 5→3; both advancements retained.
    const down = await supertest(app).post(`/api/characters/${FIXTURE_ID}/experience`).set("Cookie", COOKIE)
      .send({ operations: [{ type: "set", value: XP_LVL_6 }] });
    expect(down.status).toBe(200);
    expect(down.body.resources.maneuversKnown).toHaveLength(3);
    expect(down.body.advancements).toHaveLength(2);
    expect(hasFs(down.body.advancements)).toBe(true);

    // Find the maneuvers-reconcile event's batch.
    const activity = await supertest(app).get(`/api/characters/${FIXTURE_ID}/activity`).set("Cookie", COOKIE);
    const ev = (activity.body as Array<{ type: string; reverted: boolean; batchId?: string }>)
      .find((e) => e.type === "maneuversReconciled" && !e.reverted)!;
    expect(ev).toBeDefined();

    // Undo restores before.resources wholesale — pre-#818 this wiped advancements
    // (incl. the fs feat) because they weren't in the snapshot.
    const undo = await supertest(app).post(`/api/characters/${FIXTURE_ID}/events/${ev.batchId}/revert`).set("Cookie", COOKIE);
    expect(undo.status).toBe(200);
    expect(undo.body.resources.maneuversKnown).toHaveLength(5);
    expect(undo.body.advancements).toHaveLength(2);
    expect(hasFs(undo.body.advancements)).toBe(true);
    expect(undo.body.advancements.find((a: { slot?: string }) => a.slot !== "fightingStyle").abilityDeltas).toEqual({ strength: 2 });
  });
});
