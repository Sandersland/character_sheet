// #1588: mirrors weapon-bond-reconciliation.test.ts's shape.
import { afterEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-expertise-recon";
let COOKIE: string;
const FIXTURE_ID = "test-expertise-recon-1";

const XP_L1 = 0;
const XP_L6 = 14000;

const EXPERTISE_KNOWN = [
  { id: "ex1", skill: "stealth" },
  { id: "ex2", skill: "perception" },
  { id: "ex3", skill: "acrobatics" },
  { id: "ex4", skill: "athletics" },
];

async function createRogue() {
  const rogueClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Rogue" } })).id;
  await prisma.character.create({
    data: {
      id: FIXTURE_ID,
      name: "Expertise Reconciliation Test Rogue",
      alignment: "Chaotic Neutral",
      rulesEdition: "EDITION_2014",
      experiencePoints: XP_L6,
      initiativeBonus: 0,
      speed: 30,
      hitPoints: { current: 40, max: 40, temp: 0 },
      hitDice: { total: 6, die: "d8" },
      abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 12, charisma: 10 },
      savingThrowProficiencies: [],
      skills: [
        { name: "stealth", ability: "dexterity", proficient: true },
        { name: "perception", ability: "wisdom", proficient: true },
        { name: "acrobatics", ability: "dexterity", proficient: true },
        { name: "athletics", ability: "strength", proficient: true },
      ],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      resources: { expertiseKnown: EXPERTISE_KNOWN },
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "rogue", classId: rogueClassId, position: 0, level: 6 }] },
    },
  });
}

async function postXp(body: object) {
  return supertest(app).post(`/api/characters/${FIXTURE_ID}/experience`).set("Cookie", COOKIE).send(body);
}

describe("Level-down reconciliation trims expertiseKnown (#1588)", () => {
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("L6 -> L1 trims 4 -> 2 (LIFO: keeps the oldest two), logs expertiseReconciled, and undo restores all 4", async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createRogue();

    const res = await postXp({ operations: [{ type: "set", value: XP_L1 }] });
    expect(res.status).toBe(200);

    const char = await prisma.character.findUniqueOrThrow({ where: { id: FIXTURE_ID }, select: { resources: true } });
    const stored = (char.resources as { expertiseKnown: { id: string; skill: string }[] }).expertiseKnown;
    expect(stored.map((e) => e.skill)).toEqual(["stealth", "perception"]);

    const events = await prisma.characterEvent.findMany({ where: { characterId: FIXTURE_ID, type: "expertiseReconciled" } });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("2 Expertise skills removed — level cap reduced to 2");
    expect(events[0].data).toEqual({ removedCount: 2, allowed: 2 });

    // Same batchId as the XP-set op — LIFO undo reverts the whole batch.
    const batchId = events[0].batchId;
    const undo = await supertest(app).post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`).set("Cookie", COOKIE);
    expect(undo.status).toBe(200);
    const restored = await prisma.character.findUniqueOrThrow({ where: { id: FIXTURE_ID }, select: { resources: true } });
    const restoredKnown = (restored.resources as { expertiseKnown: { id: string; skill: string }[] }).expertiseKnown;
    expect(restoredKnown.map((e) => e.skill)).toEqual(["stealth", "perception", "acrobatics", "athletics"]);
  });

  it("staying at L6 leaves expertiseKnown untouched", async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createRogue();

    const res = await postXp({ operations: [{ type: "set", value: XP_L6 }] });
    expect(res.status).toBe(200);
    const events = await prisma.characterEvent.findMany({ where: { characterId: FIXTURE_ID, type: "expertiseReconciled" } });
    expect(events).toHaveLength(0);
  });
});
