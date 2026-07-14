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
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-serialize-char";
let COOKIE: string;
const app = createApp();

const FIGHTER_CLASS_NAME = "Test Fighter (Serialize Suite)";
const BM_SUBCLASS_NAME = "battle master";
const WARLOCK_CLASS_NAME = "Test Warlock (Serialize Suite)";
const MONK_CLASS_NAME = "Test Monk (Serialize Suite)";
const SHADOW_SUBCLASS_NAME = "Way of Shadow";
let fighterClassId: string;
let bmSubclassId: string;
let shadowSubclassId: string;
let warlockClassId: string;
let monkClassId: string;

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
  const warlock = await prisma.characterClass.upsert({
    where: { name: WARLOCK_CLASS_NAME },
    create: { name: WARLOCK_CLASS_NAME, hitDie: "d8", savingThrows: ["wisdom", "charisma"], skillChoiceCount: 2, skillChoices: ["arcana", "deception"], isSpellcaster: true },
    update: {},
  });
  warlockClassId = warlock.id;
  const monk = await prisma.characterClass.upsert({
    where: { name: MONK_CLASS_NAME },
    create: { name: MONK_CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["stealth"], isSpellcaster: false, subclassLevel: 3 },
    update: { subclassLevel: 3 },
  });
  monkClassId = monk.id;
  const shadow = await prisma.subclass.upsert({
    where: { classId_name: { classId: monk.id, name: SHADOW_SUBCLASS_NAME } },
    create: { classId: monk.id, name: SHADOW_SUBCLASS_NAME, description: "Minor Illusion at 3." },
    update: {},
  });
  shadowSubclassId = shadow.id;
  // Way of Shadow grants Minor Illusion at L3 as data (#898).
  const minorIllusion = await prisma.spell.findUnique({ where: { name: "Minor Illusion" }, select: { id: true } });
  if (minorIllusion) {
    await prisma.subclassGrantedSpell.upsert({
      where: { subclassId_spellId: { subclassId: shadow.id, spellId: minorIllusion.id } },
      create: { subclassId: shadow.id, spellId: minorIllusion.id, gateLevel: 3, castingAbility: "wisdom" },
      update: { gateLevel: 3, castingAbility: "wisdom" },
    });
  }
});
afterAll(async () => {
  await prisma.subclass.deleteMany({ where: { classId: fighterClassId, name: BM_SUBCLASS_NAME } });
  await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CLASS_NAME } });
  await prisma.subclass.deleteMany({ where: { classId: monkClassId, name: SHADOW_SUBCLASS_NAME } });
  await prisma.characterClass.deleteMany({ where: { name: WARLOCK_CLASS_NAME } });
  await prisma.characterClass.deleteMany({ where: { name: MONK_CLASS_NAME } });
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

// Char C — Warlock 11 / Fighter 1 multiclass (buildMulticlassSpellcastingView's
// Pact Magic branch: combined pool empty since only the pact caster + a
// non-caster are present, pact object populated + used-clamped separately).
async function createMulticlassWarlockFighter() {
  return prisma.character.create({
    data: {
      id: "serial-char-c",
      name: "SerialChar C",
      ownerId: OWNER_ID,
      alignment: "Chaotic Neutral",
      experiencePoints: 100000, // level 12 (warlock 11 + fighter 1), proficiency +4
      initiativeBonus: 1,
      speed: 30,
      abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
      savingThrowProficiencies: ["wisdom", "charisma"],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 11, die: "d8", spent: 0 },
      spellcasting: { slotsUsed: { "5": 1 }, arcanumUsed: { "6": 1 }, spells: [], concentratingOn: null },
      classEntries: {
        create: [
          { id: "ce-c-1", name: "warlock", classId: warlockClassId, position: 0, level: 11 },
          { id: "ce-c-2", name: FIGHTER_CLASS_NAME, classId: fighterClassId, position: 1, level: 1 },
        ],
      },
    },
  });
}

// Char D — Monk (Way of Shadow) 3 / Fighter 1 multiclass, no caster class in
// the mix: buildMulticlassSpellcastingView's slotless granted-only branch
// (multi.classes.length === 0, subclass-granted Minor Illusion surfaces).
async function createMulticlassMonkFighter() {
  return prisma.character.create({
    data: {
      id: "serial-char-d",
      name: "SerialChar D",
      ownerId: OWNER_ID,
      alignment: "Lawful Neutral",
      experiencePoints: 2700, // level 4, proficiency +2
      initiativeBonus: 2,
      speed: 40,
      abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 15, charisma: 8 },
      savingThrowProficiencies: ["strength", "dexterity"],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      hitPoints: { current: 28, max: 28, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 4, die: "d8", spent: 0 },
      spellcasting: Prisma.JsonNull,
      classEntries: {
        create: [
          { id: "ce-d-1", name: "monk", classId: monkClassId, position: 0, level: 3, subclass: SHADOW_SUBCLASS_NAME, subclassId: shadowSubclassId },
          { id: "ce-d-2", name: FIGHTER_CLASS_NAME, classId: fighterClassId, position: 1, level: 1 },
        ],
      },
    },
  });
}

// Char E — Fighter L5 with a mixed inventory (weapon/armor/consumable/gear).
// Pins serializeInventoryItem's + normalizeWeaponDetail's exact output ahead
// of decomposing both (#690 wave 1C, cyclo 15 each — driven by the field-by-
// field `??`/ternary fallbacks, not real branching). Must stay green UNEDITED
// after the extraction.
async function createInventoryFixture() {
  return prisma.character.create({
    data: {
      id: "serial-char-e",
      name: "SerialChar E",
      ownerId: OWNER_ID,
      alignment: "True Neutral",
      experiencePoints: 6500, // level 5, proficiency +3
      initiativeBonus: 0,
      speed: 30,
      abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: [],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 5, die: "d10", spent: 0 },
      spellcasting: Prisma.JsonNull,
      classEntries: { create: [{ id: "ce-e", name: FIGHTER_CLASS_NAME, classId: fighterClassId, position: 0, level: 5 }] },
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

  // ── Char C: Warlock 11 / Fighter 1 — multiclass Pact Magic branch ───────────
  it("warlock/fighter multiclass: combined pool empty, Pact Magic + arcana surfaced separately", async () => {
    await createMulticlassWarlockFighter();
    const c = (await getChar("serial-char-c")).body;

    expect(c.level).toBe(12);
    expect(c.proficiencyBonus).toBe(4);
    expect(c.spellcasting.ability).toBe("charisma");
    expect(c.spellcasting.spellSaveDC).toBe(16); // 8 + prof 4 + CHA mod 4
    expect(c.spellcasting.spellAttackBonus).toBe(8);
    // No full/half/third caster contributes to the combined pool.
    expect(c.spellcasting.slots).toEqual([]);
    expect(c.spellcasting.arcana).toEqual([{ level: 6, total: 1, used: 1 }]);
    expect(c.spellcasting.pact).toEqual({
      slotLevel: 5, count: 3, used: 1, spellSaveDC: 16, spellAttackBonus: 8,
    });
    expect(c.spellcasting.spells).toEqual([]);
    expect(c.spellcasting.concentratingOn).toBeNull();
    expect(c.classes).toHaveLength(2);
  });

  // ── Char D: Monk (Way of Shadow) 3 / Fighter 1 — multiclass granted-only ────
  it("monk/fighter multiclass with no caster class: slotless granted-spell view", async () => {
    await createMulticlassMonkFighter();
    const d = (await getChar("serial-char-d")).body;

    expect(d.level).toBe(4);
    expect(d.proficiencyBonus).toBe(2);
    expect(d.spellcasting.ability).toBe("wisdom");
    expect(d.spellcasting.spellSaveDC).toBe(12); // 8 + prof 2 + WIS mod 2
    expect(d.spellcasting.spellAttackBonus).toBe(4);
    expect(d.spellcasting.slots).toEqual([]);
    expect(d.spellcasting.arcana).toEqual([]);
    expect(d.spellcasting.pact).toBeUndefined();
    expect(d.spellcasting.spells).toHaveLength(1);
    expect(d.spellcasting.spells[0]).toMatchObject({
      id: "granted:way-of-shadow:minor-illusion",
      name: "Minor Illusion",
      source: "subclass",
    });
    expect(d.spellcasting.concentratingOn).toBeNull();
    expect(d.classes).toHaveLength(2);
  });

  // ── Char E: mixed inventory — serializeInventoryItem + normalizeWeaponDetail ─
  it("acquiring a minimal custom weapon fills every optional weapon field with its normalized default", async () => {
    await createInventoryFixture();
    const acquireResponse = await supertest(app)
      .post("/api/characters/serial-char-e/inventory/transactions")
      .set("Cookie", COOKIE)
      .send({
        operations: [
          {
            type: "acquire",
            custom: {
              name: "Ancestral Longsword",
              category: "weapon",
              weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing" },
            },
            quantity: 1,
            equipped: true,
            notes: "Keep polished.",
          },
        ],
      });
    expect(acquireResponse.status).toBe(200);

    const created = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId: "serial-char-e", name: "Ancestral Longsword" },
      include: { weaponDetail: true },
    });
    // Every optional field the minimal input omitted, pinned to its exact
    // normalizeWeaponDetail default — the source of that function's cyclo 15
    // (14 `??` fallbacks + 1).
    expect(created.weaponDetail).toEqual({
      id: expect.any(String),
      inventoryItemId: created.id,
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageModifier: 0,
      damageType: "slashing",
      versatileDiceCount: null,
      versatileDiceFaces: null,
      finesse: false,
      light: false,
      heavy: false,
      twoHanded: false,
      reach: false,
      thrown: false,
      ammunition: false,
      rangeNormal: null,
      rangeLong: null,
      weaponClass: null,
      weaponRange: null,
    });
  });

  it("serializes a mixed inventory (weapon/gear/armor/consumable) byte-for-byte", async () => {
    await createInventoryFixture();
    await supertest(app)
      .post("/api/characters/serial-char-e/inventory/transactions")
      .set("Cookie", COOKIE)
      .send({
        operations: [
          {
            type: "acquire",
            custom: {
              name: "Ancestral Longsword",
              category: "weapon",
              weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing" },
            },
            quantity: 1,
            equipped: true,
            notes: "Keep polished.",
          },
        ],
      });
    const weapon = await prisma.inventoryItem.findFirstOrThrow({
      where: { characterId: "serial-char-e", name: "Ancestral Longsword" },
    });
    // rarity/attunement/weight/cost/description aren't settable via acquire —
    // set directly to pin serializeInventoryItem's remaining truthy branches
    // (its own source of cyclo 15) below.
    await prisma.inventoryItem.update({
      where: { id: weapon.id },
      data: {
        weight: 3,
        cost: { cp: 0, sp: 0, gp: 15, pp: 0 },
        description: "A gleaming blade passed down through generations.",
        rarity: "RARE",
        attuned: true,
        requiresAttunement: true,
        attunementPrereqKind: "class",
        attunementPrereqValue: "Fighter",
      },
    });
    await prisma.inventoryCapability.create({
      data: { inventoryItemId: weapon.id, kind: "passiveBonus", target: "skill", targetKey: "athletics", op: "add", value: 1 },
    });

    // Bag-only gear item (declares a wearable slot, unequipped) — the opposite
    // branch of every optional field above, plus the `slot` fallback.
    await prisma.inventoryItem.create({
      data: { characterId: "serial-char-e", name: "Boots of Testing", category: "gear", slot: "FEET", position: 1 },
    });
    // Hits serializeInventoryItem's armorDetail branch.
    await prisma.inventoryItem.create({
      data: {
        characterId: "serial-char-e",
        name: "Traveler's Leather",
        category: "armor",
        position: 2,
        armorDetail: { create: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true } },
      },
    });
    // Hits serializeInventoryItem's consumableDetail branch.
    await prisma.inventoryItem.create({
      data: {
        characterId: "serial-char-e",
        name: "Potion of Testing",
        category: "consumable",
        quantity: 3,
        position: 3,
        consumableDetail: {
          create: { effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 0, effectDescription: "Heals 2d4.", maxUses: 1, usesRemaining: 1 },
        },
      },
    });

    const e = (await getChar("serial-char-e")).body;
    expect(e.inventory).toEqual([
      {
        id: weapon.id,
        name: "Ancestral Longsword",
        category: "weapon",
        quantity: 1,
        weight: 3,
        cost: { cp: 0, sp: 0, gp: 15, pp: 0 },
        description: "A gleaming blade passed down through generations.",
        equipped: true,
        equippedSlot: "MAIN_HAND",
        rarity: "RARE",
        attuned: true,
        requiresAttunement: true,
        attunementPrereqKind: "class",
        attunementPrereqValue: "Fighter",
        notes: "Keep polished.",
        weapon: {
          damageDiceCount: 1,
          damageDiceFaces: 8,
          damageModifier: 0,
          damageType: "slashing",
          finesse: false,
          light: false,
          heavy: false,
          twoHanded: false,
          reach: false,
          thrown: false,
          ammunition: false,
          // STR mod +3 (16), not proficient (no matching weapon grant on this fixture).
          attackBonus: 3,
          damage: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 3, abilityModifier: 3, damageType: "slashing", grip: "one-handed" },
        },
        capabilities: [{ kind: "passiveBonus", target: "skill", targetKey: "athletics", op: "add", value: 1 }],
      },
      {
        id: expect.any(String),
        name: "Boots of Testing",
        category: "gear",
        quantity: 1,
        equipped: false,
        slot: "FEET",
        attuned: false,
        requiresAttunement: false,
      },
      {
        id: expect.any(String),
        name: "Traveler's Leather",
        category: "armor",
        quantity: 1,
        equipped: false,
        attuned: false,
        requiresAttunement: false,
        armor: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true, stealthDisadvantage: false },
      },
      {
        id: expect.any(String),
        name: "Potion of Testing",
        category: "consumable",
        quantity: 3,
        equipped: false,
        attuned: false,
        requiresAttunement: false,
        consumable: {
          effectDiceCount: 2,
          effectDiceFaces: 4,
          effectModifier: 0,
          effectDescription: "Heals 2d4.",
          maxUses: 1,
          usesRemaining: 1,
        },
      },
    ]);
  });
});
