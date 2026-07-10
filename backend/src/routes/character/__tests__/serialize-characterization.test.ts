/**
 * Characterization lock for serializeCharacter's derive/clamp read path (#616).
 *
 * Builds representative characters and freezes the EXACT derived + clamped
 * fields serializeCharacter emits (level, proficiencyBonus, speed, armorClass +
 * breakdown, initiative, spellcasting view, resources view + level-clamped
 * lists, multiclass-aware classes with subclass visibility, attacksPerAction,
 * advancementSlots, conditions). It is the byte-parity oracle for the
 * view-builder extraction: green now, and must stay green UNEDITED after the
 * inline derivations become named per-domain builders.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-serialize-char";
let COOKIE: string;
const app = createApp();

const FIGHTER_CLASS_NAME = "Test Fighter (Serialize Suite)";
const BM_SUBCLASS_NAME = "battle master";
let fighterClassId: string;
let bmSubclassId: string;

async function getChar(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  const fighter = await prisma.characterClass.upsert({
    where: { name: FIGHTER_CLASS_NAME },
    create: { name: FIGHTER_CLASS_NAME, hitDie: "d10", savingThrows: ["strength", "constitution"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false, subclassLevel: 3 },
    update: { subclassLevel: 3 },
  });
  fighterClassId = fighter.id;
  const bm = await prisma.subclass.upsert({
    where: { classId_name: { classId: fighter.id, name: BM_SUBCLASS_NAME } },
    create: { classId: fighter.id, name: BM_SUBCLASS_NAME, description: "Maneuvers." },
    update: {},
  });
  bmSubclassId = bm.id;
});
afterAll(async () => {
  await prisma.subclass.deleteMany({ where: { classId: fighterClassId, name: BM_SUBCLASS_NAME } });
  await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CLASS_NAME } });
});
afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "SerialChar" } } });
});

// Char A — Battle Master Fighter L5 (subclass, resources, conditions, unarmored AC).
async function createFighter() {
  return prisma.character.create({
    data: {
      id: "serial-char-a",
      name: "SerialChar A",
      ownerId: OWNER_ID,
      alignment: "Lawful Good",
      experiencePoints: 6500, // level 5, proficiency +3
      initiativeBonus: 0,
      speed: 30,
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 12, charisma: 8 },
      savingThrowProficiencies: ["strength", "constitution"],
      skills: ["athletics", "intimidation"],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      hitPoints: { current: 44, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 5, die: "d10", spent: 0 },
      spellcasting: Prisma.JsonNull,
      conditions: { conditions: ["prone"], exhaustion: 1 },
      resources: {
        used: { superiorityDice: 1 },
        maneuversKnown: [
          { id: "m1", name: "Riposte", description: "Counter." },
          { id: "m2", name: "Trip Attack", description: "Prone." },
          { id: "m3", name: "Menacing Attack", description: "Frighten." },
        ],
        toolProficienciesKnown: [{ id: "tp1", name: "Smith's Tools" }],
      },
      classEntries: { create: [{ id: "ce-a", name: FIGHTER_CLASS_NAME, classId: fighterClassId, position: 0, level: 5, subclassId: bmSubclassId, subclass: BM_SUBCLASS_NAME }] },
    },
  });
}

// Char B — Wizard L5 (spellcasting view: slots/DC/attack with some used).
async function createWizard() {
  return prisma.character.create({
    data: {
      id: "serial-char-b",
      name: "SerialChar B",
      ownerId: OWNER_ID,
      alignment: "Neutral Good",
      experiencePoints: 6500, // level 5, proficiency +3
      initiativeBonus: 1,
      speed: 30,
      abilityScores: { strength: 8, dexterity: 14, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: ["intelligence", "wisdom"],
      skills: ["arcana"],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      hitPoints: { current: 22, max: 22, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 5, die: "d6", spent: 0 },
      spellcasting: { slotsUsed: { "1": 2, "2": 1 }, arcanumUsed: {}, spells: [], concentratingOn: null },
      classEntries: { create: [{ id: "ce-b", name: "wizard", position: 0, level: 5 }] },
    },
  });
}

describe("serializeCharacter derive/clamp characterization (#616)", () => {
  // ── Char A: Battle Master Fighter L5 — level/prof/AC/resources/conditions ────
  it("fighter: derives level, proficiency, unarmored AC, resources view + clamp", async () => {
    await createFighter();
    const a = (await getChar("serial-char-a")).body;

    // Derive-don't-persist scalars.
    expect(a.level).toBe(5);
    expect(a.proficiencyBonus).toBe(3);
    expect(a.speed).toBe(30);
    expect(a.attacksPerAction).toBe(1); // Extra Attack not until fighter 5? locked as current
    // Unarmored AC = 10 + Dex(+2).
    expect(a.armorClass).toBe(12);
    expect(a.armorClassBreakdown).toEqual([{ label: "Unarmored", value: 10 }, { label: "Dex", value: 2 }]);

    // Battle Master resources view: derived counts + pool remaining + clamped lists.
    expect(a.resources.maneuverChoiceCount).toBe(3);
    expect(a.resources.maneuverSaveDC).toBe(14);
    expect(a.resources.toolProfChoiceCount).toBe(1);
    expect(a.resources.pools).toEqual([
      expect.objectContaining({ key: "superiorityDice", label: "Superiority Dice", total: 4, die: "d8", recharge: "short-or-long", used: 1, remaining: 3 }),
    ]);
    expect(a.resources.maneuversKnown).toEqual([
      { id: "m1", name: "Riposte", description: "Counter." },
      { id: "m2", name: "Trip Attack", description: "Prone." },
      { id: "m3", name: "Menacing Attack", description: "Frighten." },
    ]);
    expect(a.resources.toolProficienciesKnown).toEqual([{ id: "tp1", name: "Smith's Tools" }]);
    expect(a.resources.disciplinesKnown).toEqual([]);
    expect(a.resources.fightingStyle).toBeNull();

    expect(a.conditions).toEqual({ active: [], exhaustion: 1 });
    expect(a.advancementSlots).toEqual({ total: 1, used: 0 });

    // Multiclass-aware classes view + subclass visibility (level 5 ≥ subclassLevel 3).
    expect(a.classes[0]).toMatchObject({ id: "ce-a", name: FIGHTER_CLASS_NAME, level: 5, subclass: "battle master" });
    expect(typeof a.classes[0].subclassId).toBe("string");
    expect(a.classes).toHaveLength(1);
  });

  // ── Char B: Wizard L5 — spellcasting view derivation ────────────────────────
  it("wizard: derives spellcasting slots, save DC, attack bonus", async () => {
    await createWizard();
    const b = (await getChar("serial-char-b")).body;

    expect(b.level).toBe(5);
    expect(b.proficiencyBonus).toBe(3);
    expect(b.spellcasting.ability).toBe("intelligence");
    expect(b.spellcasting.spellSaveDC).toBe(14); // 8 + prof 3 + INT mod 3
    expect(b.spellcasting.spellAttackBonus).toBe(6); // prof 3 + INT mod 3
    // Full-caster L5 slot table with the fixture's used counts preserved.
    expect(b.spellcasting.slots).toEqual([
      { level: 1, total: 4, used: 2 },
      { level: 2, total: 3, used: 1 },
      { level: 3, total: 2, used: 0 },
    ]);
    expect(b.spellcasting.arcana).toEqual([]);
    expect(b.spellcasting.concentratingOn).toBeNull();

    // Single class, no subclass.
    expect(b.classes).toEqual([{ id: "ce-b", name: "wizard", level: 5 }]);
    expect(b.conditions).toEqual({ active: [], exhaustion: 0 });
  });
});
