// Fighter 4 / Wizard 1 multiclass: the Wizard entry's subclass is below its subclassLevel gate — both the read clamp (serializeCharacter) and the write reconciler (reconcileSubclass) must correct it per-entry, leaving the primary Fighter untouched.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-mc-subclass";
const FIXTURE_ID = "test-mc-subclass-1";
const FIGHTER_CATALOG_NAME = "MC Subclass Test Fighter";
const WIZARD = "Wizard";
let COOKIE: string;
let fighterId: string;
let wizardId: string;

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "MC Subclass Fixture",
  alignment: "True Neutral",
  experiencePoints: 6500,
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

// maneuverChoiceCount must derive per-entry: loadResourcesReconcileState and buildResourcesView must not read classEntries[0] (the primary) at total level — undefined for a spellcaster primary skips the cap check entirely.
describe("entry-scoped maneuver reconcile + clamp (#1177)", () => {
  const OWNER = "owner-1177-maneuver-reconcile";
  let cookie: string;

  const FIVE_MANEUVERS = Array.from({ length: 5 }, (_, i) => ({
    id: `custom-maneuver-${i}`,
    name: `Custom Maneuver ${i}`,
    description: "d",
  }));

  function resourcesWith(maneuversKnown: typeof FIVE_MANEUVERS) {
    return {
      used: {},
      maneuversKnown,
      toolProficienciesKnown: [],
      choicesKnown: {},
      advancements: [],
    };
  }

  const CHAR_BASE = {
    alignment: "True Neutral",
    initiativeBonus: 0,
    speed: 30,
    hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 15, wisdom: 10, charisma: 10 },
    savingThrowProficiencies: [],
    skills: [],
    toolProficiencies: [],
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
  };

  let evocationWizardId: string;
  let evocationSubclassId: string;
  let battleMasterFighterId: string;
  let battleMasterSubclassId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER);
    cookie = await authCookie(OWNER);
    // Production always sets classId/subclassId alongside the subclass string — resolved here to match that shape.
    evocationWizardId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } })).id;
    evocationSubclassId = (await prisma.subclass.findFirstOrThrow({ where: { classId: evocationWizardId, name: "School of Evocation" } })).id;
    battleMasterFighterId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } })).id;
    battleMasterSubclassId = (await prisma.subclass.findFirstOrThrow({ where: { classId: battleMasterFighterId, name: "Battle Master" } })).id;
  });

  it("level-down trims the secondary fighter's maneuvers to ITS OWN new cap (3), not to 0", async () => {
    const CHAR_ID = "test-1177-maneuver-reconcile-trim";
    await prisma.character.create({
      data: {
        ...CHAR_BASE,
        id: CHAR_ID,
        name: "1177 Maneuver Reconcile Trim",
        ownerId: OWNER,
        experiencePoints: 64000,
        hitDice: { total: 10, die: "d8", spent: 0 },
        resources: resourcesWith(FIVE_MANEUVERS) as unknown as Prisma.InputJsonValue,
        classEntries: {
          create: [
            { name: "wizard", subclass: "School of Evocation", subclassId: evocationSubclassId, classId: evocationWizardId, position: 0, level: 3 },
            { name: "fighter", subclass: "Battle Master", subclassId: battleMasterSubclassId, classId: battleMasterFighterId, position: 1, level: 7 },
          ],
        },
      },
    });

    // reconcileClassEntryLevels trims LIFO by position, so the secondary (fighter) loses the level; fighter-6 Battle Master caps at 3 maneuvers.
    const xp = await supertest(app)
      .post(`/api/characters/${CHAR_ID}/experience`)
      .set("Cookie", cookie)
      .send({ operations: [{ type: "set", value: 48000 }] });
    expect(xp.status).toBe(200);
    expect(xp.body.resources.maneuversKnown).toHaveLength(3);

    const fighterEntry = await prisma.characterClassEntry.findFirstOrThrow({
      where: { characterId: CHAR_ID, position: 1 },
    });
    expect(fighterEntry.level).toBe(6);

    const activity = await supertest(app)
      .get(`/api/characters/${CHAR_ID}/activity?category=resources`)
      .set("Cookie", cookie);
    const reconciled = (activity.body as Array<{ type: string; data?: Record<string, unknown> }>).find(
      (e) => e.type === "maneuversReconciled",
    );
    expect(reconciled?.data).toMatchObject({ removedCount: 2, allowed: 3 });

    await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  });

  it("clamp-on-read caps a not-yet-reconciled secondary fighter's maneuvers to ITS OWN entry-level cap", async () => {
    const CHAR_ID = "test-1177-maneuver-reconcile-clamp";
    await prisma.character.create({
      data: {
        ...CHAR_BASE,
        id: CHAR_ID,
        name: "1177 Maneuver Reconcile Clamp",
        ownerId: OWNER,
        experiencePoints: 48000,
        hitDice: { total: 9, die: "d8", spent: 0 },
        // Simulates a not-yet-reconciled character: 5 maneuvers stored though the fighter entry is already at level 6 (cap 3).
        resources: resourcesWith(FIVE_MANEUVERS) as unknown as Prisma.InputJsonValue,
        classEntries: {
          create: [
            { name: "wizard", subclass: "School of Evocation", subclassId: evocationSubclassId, classId: evocationWizardId, position: 0, level: 3 },
            { name: "fighter", subclass: "Battle Master", subclassId: battleMasterSubclassId, classId: battleMasterFighterId, position: 1, level: 6 },
          ],
        },
      },
    });

    const res = await supertest(app).get(`/api/characters/${CHAR_ID}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.resources.maneuverChoiceCount).toBe(3);
    expect(res.body.resources.maneuversKnown).toHaveLength(3);

    // Read-only clamp — the persisted row is untouched.
    const persisted = await prisma.character.findUniqueOrThrow({ where: { id: CHAR_ID } });
    expect((persisted.resources as { maneuversKnown: unknown[] }).maneuversKnown).toHaveLength(5);

    await prisma.character.deleteMany({ where: { id: CHAR_ID } });
  });
});
