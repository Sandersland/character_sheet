import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { applyConditionInTx } from "@/lib/combat/conditions.js";

const OWNER_ID = "owner-apply-condition-in-tx";
let COOKIE: string;

const BARB_ID = "test-apply-condition-in-tx-barbarian";
let barbClassId: string;
let berserkerId: string;

async function createRagingBerserkerWithSuspendedFrightened() {
  await prisma.character.create({
    data: {
      id: BARB_ID,
      name: "applyConditionInTx Test Barbarian",
      alignment: "Chaotic Neutral",
      rulesEdition: "EDITION_2014",
      experiencePoints: 14000,
      ownerId: OWNER_ID,
      initiativeBonus: 2,
      speed: 40,
      hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 6, die: "d12", spent: 0 },
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 8, wisdom: 10, charisma: 8 },
      savingThrowProficiencies: ["strength", "constitution"],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      classEntries: {
        create: [{ name: "barbarian", subclass: "Berserker", subclassId: berserkerId, classId: barbClassId, position: 0, level: 6 }],
      },
    },
  });

  const cookie = () =>
    supertest.agent(app).set("Cookie", COOKIE);
  await cookie().post(`/api/characters/${BARB_ID}/conditions/transactions`).send({
    operations: [{ type: "applyCondition", key: "frightened" }],
  });
  const raged = await cookie()
    .post(`/api/characters/${BARB_ID}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey: "rage" }] });
  expect(raged.body.conditions.active).toEqual([]);
  expect(raged.body.conditions.suspended).toEqual([
    expect.objectContaining({ key: "frightened", gatingBuffKey: "rage" }),
  ]);
}

async function readConditions() {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: BARB_ID }, select: { conditions: true } });
  return row.conditions as { active: { key: string }[]; suspended: { key: string }[] };
}

describe("applyConditionInTx (#1121 review findings 2 & 3)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    barbClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Barbarian" } })).id;
    berserkerId = (await prisma.subclass.findFirstOrThrow({ where: { classId: barbClassId, name: "Berserker" } })).id;
    await createRagingBerserkerWithSuspendedFrightened();
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: BARB_ID } });
  });

  it("finding 2a: does not re-apply a condition that is currently SUSPENDED (not just active)", async () => {
    await prisma.$transaction((tx) => applyConditionInTx(tx, BARB_ID, "frightened", "test self-apply", randomUUID(), null));
    const conditions = await readConditions();
    expect(conditions.active).toEqual([]);
    expect(conditions.suspended).toEqual([expect.objectContaining({ key: "frightened" })]);
  });

  it("finding 2b: does not apply a condition the character is currently IMMUNE to (mirrors the public write-guard)", async () => {
    await prisma.$transaction((tx) => applyConditionInTx(tx, BARB_ID, "charmed", "test self-apply", randomUUID(), null));
    const conditions = await readConditions();
    expect(conditions.active).toEqual([]);
    expect(conditions.suspended.map((s) => s.key)).not.toContain("charmed");
  });

  it("still applies a NON-immune, NON-suspended condition normally — the guards are scoped, not a blanket no-op", async () => {
    await prisma.$transaction((tx) => applyConditionInTx(tx, BARB_ID, "poisoned", "test self-apply", randomUUID(), null));
    const conditions = await readConditions();
    expect(conditions.active).toEqual([expect.objectContaining({ key: "poisoned" })]);
  });
});
