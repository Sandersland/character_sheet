import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-discipline-recon";
let COOKIE: string;
const FIXTURE_ID = "test-discipline-recon-monk-1";

const XP_L6 = 14000;
const XP_L17 = 225000;

const BASE = {
  id: FIXTURE_ID,
  name: "Discipline Reconciliation Test Monk",
  alignment: "Neutral",
  initiativeBonus: 3,
  speed: 40,
  hitPoints: { current: 80, max: 80, temp: 0 },
  hitDice: { total: 17, die: "d8" },
  abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: ["stealth"],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  rulesEdition: "EDITION_2014" as const,
};

// Real seeded Monk class/subclass — a fixture class with no ClassFeature rows would see no pools/choices at all.
let classId: string;
let subclassId: string;

function disc(id: string, name: string) {
  return { id, optionId: `catalog-${id}`, name, description: "fixture" };
}

async function createL17Monk() {
  await prisma.character.create({
    data: {
      ...BASE,
      experiencePoints: XP_L17,
      ownerId: OWNER_ID,
      resources: {
        used: {},
        maneuversKnown: [],
        toolProficienciesKnown: [],
        // 4 known disciplines — the L17 cap.
        choicesKnown: { fourElementsDisciplines: [disc("d1", "A"), disc("d2", "B"), disc("d3", "C"), disc("d4", "D")] },
        advancements: [],
      } as unknown as Prisma.InputJsonValue,
      classEntries: { create: [{ name: "monk", subclass: "way of the four elements", classId, subclassId, position: 0 }] },
    },
  });
}

async function postXp(body: object) {
  return supertest(app).post(`/api/characters/${FIXTURE_ID}/experience`).set("Cookie", COOKIE).send(body);
}

beforeAll(async () => {
  const monk = await prisma.characterClass.findFirstOrThrow({ where: { name: "Monk" } });
  classId = monk.id;
  subclassId = (await prisma.subclass.findFirstOrThrow({ where: { name: "Way of the Four Elements", classId } })).id;
});

describe("Level-down reconciliation trims fourElementsDisciplines (#1503, generic mechanism #899)", () => {
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("L17→L6 trims 4 known disciplines to 2 (the L6 cap), logs subclassChoicesReconciled, and undo restores all 4", async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createL17Monk();

    const res = await postXp({ operations: [{ type: "set", value: XP_L6 }] });
    expect(res.status).toBe(200);
    const known = res.body.resources.subclassChoices?.find((c: { key: string }) => c.key === "fourElementsDisciplines");
    expect(known?.count).toBe(2);

    const row = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { resources: true } });
    const choicesKnown = (row!.resources as { choicesKnown: Record<string, unknown[]> }).choicesKnown;
    expect(choicesKnown.fourElementsDisciplines).toHaveLength(2);
    // LIFO order preserved: the FIRST two entries survive the trim.
    expect((choicesKnown.fourElementsDisciplines as { id: string }[]).map((e) => e.id)).toEqual(["d1", "d2"]);

    const reconciled = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "subclassChoicesReconciled" },
    });
    expect(reconciled).not.toBeNull();

    const batchId = reconciled!.batchId;
    const undo = await supertest(app).post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`).set("Cookie", COOKIE);
    expect(undo.status).toBe(200);
    const restored = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { resources: true } });
    expect((restored!.resources as { choicesKnown: Record<string, unknown[]> }).choicesKnown.fourElementsDisciplines).toHaveLength(4);
  });
});

// LEVEL_GATED_RECONCILERS is module-local (not exported), so reading its literal array off the source is the only way to pin its shape without widening that module's public surface just for a test.
describe("LEVEL_GATED_RECONCILERS gained no entry for disciplines (#1503)", () => {
  it("still 9 reconcilers (#1588 added reconcileExpertise, a bespoke list unlike disciplines' generic reuse), reconcileSubclassChoices present, no discipline-specific reconciler added", () => {
    const path = fileURLToPath(new URL("../level-reconciliation.js", import.meta.url)).replace(/\.js$/, ".ts");
    const text = readFileSync(path, "utf-8");
    const match = text.match(/const LEVEL_GATED_RECONCILERS: Reconciler\[\] = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();
    const entries = match![1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(entries).toEqual([
      "reconcileClassEntryLevels",
      "reconcileSubclass",
      "reconcileWeaponBond",
      "reconcileGrantedSpells",
      "reconcilePreparedSpells",
      "reconcileManeuvers",
      "reconcileToolProficiencies",
      "reconcileExpertise",
      "reconcileSubclassChoices",
      "reconcileAdvancements",
    ]);
    expect(entries.some((e) => /discipline/i.test(e))).toBe(false);
  });
});
