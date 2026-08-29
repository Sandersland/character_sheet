/**
 * #1980: assertKnownActionKeys/computeHeightenedFocusTempHp used to read via
 * the global prisma client BEFORE the transaction opened. A concurrent
 * level-up landing between that read and lockCharacterRow meant a monk who
 * just hit level 10 could still get 0 Heightened Focus temp HP, because the
 * pre-flight read had already captured the stale (pre-level-up) level.
 *
 * lockCharacterRow is the first statement inside the transaction, so hooking
 * it deterministically pinpoints "after every pre-tx read, before the row is
 * locked" — exactly the old race window — with no real clock-based race
 * needed: JS's single-threaded await ordering guarantees any pre-tx reads
 * have already resolved by the time this hook fires.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

vi.mock("@/lib/character/character-transaction.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/character/character-transaction.js")>();
  return {
    ...actual,
    lockCharacterRow: async (
      tx: Parameters<typeof actual.lockCharacterRow>[0],
      characterId: string,
    ) => {
      const hook = onFirstLock;
      onFirstLock = null;
      if (hook) await hook();
      return actual.lockCharacterRow(tx, characterId);
    },
  };
});

// Fires once, the moment the transaction's first lockCharacterRow call happens — used to
// land a concurrent level-up exactly at the old race window before the row lock is acquired.
let onFirstLock: (() => Promise<void>) | null = null;

const { app } = await import("@/test-support/app-server.js");
const { prisma } = await import("@/lib/core/prisma.js");
const { ensureTestOwner } = await import("@/test-support/owner.js");
const { authCookie } = await import("@/test-support/auth.js");

const OWNER_ID = "owner-actions-heightened-focus-race";
let COOKIE: string;

const MONK_ID = "test-actions-heightened-focus-race";
const MONK_CATALOG_NAME = "Zzz Heightened Focus Race Test Monk";
let monkClassId: string;

const L9_XP = 48000; // single-class monk level 9 — one level short of Heightened Focus

async function seedFocusActionRows(classId: string) {
  await prisma.classFeature.deleteMany({ where: { classId } });
  await prisma.classFeature.createMany({
    data: [
      {
        classId, subclassId: null, name: "Focus", level: 2, edition: "EDITION_2024",
        description: "You have a pool of Focus Points equal to your monk level.",
        resourceKey: "focus", resourceLabel: "Focus Points", resourceRecharge: "short-or-long",
        resourceTotals: [{ minLevel: 2, total: { levelTimes: 1 } }],
      },
      {
        classId, subclassId: null, name: "Patient Defense (1 Focus)", level: 2, edition: "EDITION_2024",
        description: "Spend 1 Focus to take Disengage + Dodge together as a Bonus Action (also grants temporary hit points at Heightened Focus, monk L10).",
        resourceKey: "patientDefenseFocus", activationCost: "bonusAction", costKind: "pool", costPoolKey: "focus", costBase: 1,
        regrants: ["disengage", "dodge"], actionOnly: true,
      },
    ],
  });
}

async function createMonk() {
  await prisma.character.create({
    data: {
      id: MONK_ID,
      name: "Heightened Focus Race Test",
      alignment: "Lawful Neutral",
      initiativeBonus: 2,
      speed: 30,
      hitPoints: { current: 70, max: 70, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 9, die: "d8", spent: 0 },
      abilityScores: {
        strength: 12,
        dexterity: 16,
        constitution: 12,
        intelligence: 10,
        wisdom: 14,
        charisma: 8,
      },
      savingThrowProficiencies: ["strength", "dexterity"],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      experiencePoints: L9_XP,
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "monk", classId: monkClassId, position: 0, level: 9 }] },
    },
  });
}

function executeAction(actionKey: string) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${MONK_ID}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey }] });
}

describe("POST /:id/actions/transactions — Heightened Focus race with a concurrent level-up (#1980)", () => {
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: MONK_CATALOG_NAME } });
  });

  beforeEach(async () => {
    onFirstLock = null;
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: MONK_CATALOG_NAME },
      create: {
        name: MONK_CATALOG_NAME,
        hitDie: "d8",
        savingThrows: ["strength", "dexterity"],
        skillChoiceCount: 2,
        skillChoices: ["acrobatics", "stealth"],
        isSpellcaster: false,
        subclassLevel: 3,
      },
      update: {},
    });
    monkClassId = cls.id;
    await seedFocusActionRows(monkClassId);
    await createMonk();
  });

  afterEach(async () => {
    onFirstLock = null;
    await prisma.character.deleteMany({ where: { id: MONK_ID } });
  });

  it("picks up a level-up that lands after the request's pre-tx reads but before the row lock", async () => {
    onFirstLock = async () => {
      await prisma.characterClassEntry.updateMany({
        where: { characterId: MONK_ID, name: "monk" },
        data: { level: 10 },
      });
      await prisma.character.update({ where: { id: MONK_ID }, data: { experiencePoints: 64000 } });
    };

    const res = await executeAction("patientDefenseFocus");

    expect(res.status).toBe(200);
    // Heightened Focus (monk L10+): two Martial Arts die rolls, so 2-16 temp HP — never 0.
    expect(res.body.hitPoints.temp).toBeGreaterThan(0);
  });
});
