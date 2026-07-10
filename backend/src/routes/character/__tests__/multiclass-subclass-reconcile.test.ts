/**
 * Per-entry subclass reconciliation + clamp-on-read — issue #125.
 * Fixture: a Fighter 4 / Wizard 1 multiclass (XP 6500 → derived level 5). The
 * Wizard entry carries a subclass even though its per-class level (1) is below
 * Wizard's subclassLevel (2). This is an invalid state that both the read clamp
 * (serializeCharacter `classes`) and the write reconciler (reconcileSubclass)
 * must correct per-entry — the primary Fighter is well past its own grant level,
 * so only the secondary entry is affected.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-mc-subclass";
const FIXTURE_ID = "test-mc-subclass-1";
const FIGHTER_CATALOG_NAME = "MC Subclass Test Fighter";
const WIZARD = "Wizard";
let COOKIE: string;
let fighterId: string;
let wizardId: string;

const app = createApp();

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "MC Subclass Fixture",
  alignment: "True Neutral",
  experiencePoints: 6500, // derived level 5
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 5, die: "d10", spent: 0 },
  abilityScores: {
    strength: 15,
    dexterity: 12,
    constitution: 14,
    intelligence: 13,
    wisdom: 10,
    charisma: 10,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("per-entry subclass reconcile + clamp (#125)", () => {
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);

    const f = await prisma.characterClass.upsert({
      where: { name: FIGHTER_CATALOG_NAME },
      create: { name: FIGHTER_CATALOG_NAME, hitDie: "d10", savingThrows: ["strength"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false },
      update: {},
    });
    const w = await prisma.characterClass.upsert({
      where: { name: WIZARD },
      create: { name: WIZARD, hitDie: "d6", savingThrows: ["intelligence"], skillChoiceCount: 2, skillChoices: ["arcana"], isSpellcaster: true },
      update: {},
    });
    fighterId = f.id;
    wizardId = w.id;

    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [
            { name: "fighter", classId: fighterId, position: 0, level: 4 },
            { name: WIZARD, classId: wizardId, position: 1, level: 1, subclass: "Evocation" },
          ],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("clamp-on-read hides a subclass on an entry below its grant level", async () => {
    const res = await supertest(app).get(`/api/characters/${FIXTURE_ID}`).set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.classes).toHaveLength(2);
    const wizard = res.body.classes.find((c: { name: string }) => c.name === WIZARD);
    expect(wizard.level).toBe(1);
    expect(wizard.subclass).toBeUndefined();
  });

  it("reconcile-on-write clears the below-grant subclass on an XP op", async () => {
    // Any XP op runs the level-gated reconcilers; keep the level at 5.
    const xp = await supertest(app)
      .post(`/api/characters/${FIXTURE_ID}/experience`)
      .set("Cookie", COOKIE)
      .send({ operations: [{ type: "set", value: 8000 }] });
    expect(xp.status).toBe(200);

    const entry = await prisma.characterClassEntry.findFirst({
      where: { characterId: FIXTURE_ID, position: 1 },
    });
    expect(entry?.subclass).toBeNull();
  });
});
