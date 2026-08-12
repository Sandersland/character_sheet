/**
 * Characterization lock for serializeCharacter's derive/clamp read path (#616).
 *
 * Builds representative characters and freezes the EXACT derived + clamped
 * fields serializeCharacter emits (level, proficiencyBonus, speed, armorClass +
 * breakdown, initiative, spellcasting view, resources view + level-clamped
 * lists, multiclass-aware classes with subclass visibility, attacksPerAction,
 * advancementSlots, conditions). It is the byte-parity oracle for the
 * view-builder extraction: green now, and must stay green UNEDITED after the
 * inline derivations become named per-domain builders. That latch is about
 * *refactors* — a deliberate wire-shape change (e.g. #1382 adding a field) does
 * update the expectations here, and the strict toEqual is what forces it to.
 */

import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
import { battleMasterResourceRowsData } from "@/test-support/fighter-resource-rows.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";
import { readInventorySnapshot } from "@/lib/inventory/inventory-snapshot-read.js";

const OWNER_ID = "owner-serialize-char";
let COOKIE: string;

const FIGHTER_CLASS_NAME = "Test Fighter (Serialize Suite)";
const BM_SUBCLASS_NAME = "battle master";
const WARLOCK_CLASS_NAME = "Test Warlock (Serialize Suite)";
const MONK_CLASS_NAME = "Test Monk (Serialize Suite)";
const SHADOW_SUBCLASS_NAME = "Warrior of Shadow";
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
  const bm = await upsertEditionRow(
    prisma.subclass,
    { classId: fighter.id, name: BM_SUBCLASS_NAME, edition: null },
    // Distinct from the real seeded slugs (#1277) — this test's Fighter/Monk
    // classes are their own throwaway rows, and (slug, edition) is unique
    // catalog-wide regardless of classId.
    { classId: fighter.id, name: BM_SUBCLASS_NAME, description: "Maneuvers.", slug: "fighter-battle-master-serialize-characterization-test" },
    {},
  );
  bmSubclassId = bm.id;
  // #1546 Part B-i (Ruling 2): shared helper, not a per-file copy — this
  // suite doesn't assert on `.features` today, but every bespoke Battle
  // Master Subclass row needs these rows attached: Part B-ii moved the
  // pool/count derivation onto the seeded ClassFeature rows themselves
  // (registry.ts's deriveRowExtras), retiring lib/classes/fighter.ts's old
  // resourceFn/deriveExtras entirely (#1532) — a bespoke Subclass row with no
  // rows attached now derives nothing.
  await prisma.classFeature.deleteMany({ where: { subclassId: bmSubclassId } });
  await prisma.classFeature.createMany({ data: battleMasterResourceRowsData(fighterClassId, bmSubclassId) });
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
  const shadow = await upsertEditionRow(
    prisma.subclass,
    { classId: monk.id, name: SHADOW_SUBCLASS_NAME, edition: null },
    { classId: monk.id, name: SHADOW_SUBCLASS_NAME, description: "Minor Illusion at 3.", slug: "monk-warrior-of-shadow-serialize-characterization-test" },
    {},
  );
  shadowSubclassId = shadow.id;
  // Warrior of Shadow grants Minor Illusion at L3 as data (#898).
  const minorIllusion = await prisma.spell.findFirst({ where: { name: "Minor Illusion" }, select: { id: true } });
  if (!minorIllusion) throw new Error("Minor Illusion not seeded — run `prisma db seed` before tests");
  // upsertEditionRow: the widened (subclassId, spellId, edition) shorthand
  // can't express a null edition at runtime (#1625).
  await upsertEditionRow(
    prisma.subclassGrantedSpell,
    { subclassId: shadow.id, spellId: minorIllusion.id, edition: null },
    { subclassId: shadow.id, spellId: minorIllusion.id, gateLevel: 3, castingAbility: "wisdom", edition: null },
    { gateLevel: 3, castingAbility: "wisdom" },
  );
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

// Char D — Monk (Warrior of Shadow) 3 / Fighter 1 multiclass, no caster class in
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
    expect(a.speed).toBe(25); // base 30 − exhaustion 1 (−5 ft×level, SRD 5.2 / #1136)
    // 1, not 2 — this suite's throwaway CharacterClass row carries no Extra
    // Attack ClassFeature row, so deriveAttacksPerAction's floor applies. A
    // real seeded Fighter 5 gets 2 (extra-attack-seeded.test.ts). Dates to
    // #616, predates #1530 — this is a fixture artifact, not a product bug
    // (#1546 Ruling 3).
    expect(a.attacksPerAction).toBe(1);
    // Unarmored AC = 10 + Dex(+2).
    expect(a.armorClass).toBe(12);
    expect(a.armorClassBreakdown).toEqual([{ label: "Unarmored", value: 10 }, { label: "Dex", value: 2 }]);

    // Battle Master resources view: derived counts + pool remaining + clamped lists.
    expect(a.resources.maneuverChoiceCount).toBe(3);
    expect(a.resources.toolProfChoiceCount).toBe(1);
    // Folded into the rider contract (#1316) — top-level, not nested in
    // resources; named for the feature (`maneuvers`), like every other rider.
    expect(a.maneuvers).toEqual({ saveDC: 14 });
    expect(a.resources.pools).toEqual([
      expect.objectContaining({ key: "superiorityDice", label: "Superiority Dice", total: 4, die: "d8", recharge: "short-or-long", used: 1, remaining: 3 }),
    ]);
    // #1381: each row now also serves `effect`, resolved dice tracking this
    // Battle Master's current (d8) superiority die.
    const maneuverEffect = expect.objectContaining({ dice: { count: 1, faces: 8, modifier: 0 } });
    expect(a.resources.maneuversKnown).toEqual([
      { id: "m1", name: "Riposte", description: "Counter.", effect: maneuverEffect },
      { id: "m2", name: "Trip Attack", description: "Prone.", effect: maneuverEffect },
      { id: "m3", name: "Menacing Attack", description: "Frighten.", effect: maneuverEffect },
    ]);
    expect(a.resources.toolProficienciesKnown).toEqual([{ id: "tp1", name: "Smith's Tools" }]);

    expect(a.conditions).toEqual({ active: [], exhaustion: 1, suspended: [] });
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
    // Prepared-spell cap (SRD 5.2): Wizard L5 table column = 9; empty spellbook → 0 prepared.
    expect(b.spellcasting.preparedSpellLimit).toBe(9);
    expect(b.spellcasting.preparedSpellCount).toBe(0);

    // Single class, no subclass — gate passed (L5) and unchosen, so needsSubclass (#1598).
    expect(b.classes).toEqual([{ id: "ce-b", name: "wizard", level: 5, needsSubclass: true, subclassUnavailable: false }]);
    expect(b.conditions).toEqual({ active: [], exhaustion: 0, suspended: [] });
  });

  // Clamp-on-read (#1127): an over-cap prepared blob renders exactly `limit`
  // prepared leveled runes (the reconciler trims on write; this is the read-side
  // safety net for a blob that got ahead of the cap).
  it("wizard: over-cap prepared blob clamps to exactly the limit on read", async () => {
    await prisma.character.create({
      data: {
        id: "serial-char-overcap", name: "SerialChar Overcap", ownerId: OWNER_ID, alignment: "Neutral",
        experiencePoints: 6500, initiativeBonus: 0, speed: 30, // Wizard L5 → prepared cap 9
        abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: ["intelligence"], skills: [], toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        hitPoints: { current: 22, max: 22, temp: 0 }, hitDice: { total: 5, die: "d6" },
        spellcasting: {
          slotsUsed: {}, arcanumUsed: {}, concentratingOn: null,
          spells: Array.from({ length: 12 }, (_, i) => ({
            id: `oc-${i + 1}`, name: `Overcap ${i + 1}`, level: 1, school: "evocation", prepared: true,
            castingTime: "1 action", range: "60 ft", duration: "Instantaneous", description: "x",
          })),
        },
        classEntries: { create: [{ name: "wizard", position: 0, level: 5 }] },
      },
    });
    const oc = (await getChar("serial-char-overcap")).body;
    expect(oc.spellcasting.preparedSpellLimit).toBe(9);
    expect(oc.spellcasting.preparedSpellCount).toBe(9);
    // The first 9 stay prepared; entries beyond the cap remain in the book, unprepared.
    expect(oc.spellcasting.spells.filter((s: { prepared: boolean }) => s.prepared)).toHaveLength(9);
    expect(oc.spellcasting.spells).toHaveLength(12);
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
    // SRD 5.2: Warlock is now a prepared caster (L11 table = 11); Fighter contributes 0.
    expect(c.spellcasting.preparedSpellLimit).toBe(11);
    expect(c.spellcasting.preparedSpellCount).toBe(0);
    expect(c.classes).toHaveLength(2);
  });

  // ── Char D: Monk (Warrior of Shadow) 3 / Fighter 1 — multiclass granted-only ────
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
      id: "granted:warrior-of-shadow:minor-illusion",
      name: "Minor Illusion",
      source: "subclass",
    });
    expect(d.spellcasting.concentratingOn).toBeNull();
    // No prepared caster in the mix → null cap; the source:"subclass" cantrip grant
    // is excluded from the count (source!=null and level 0 both disqualify it).
    expect(d.spellcasting.preparedSpellLimit).toBeNull();
    expect(d.spellcasting.preparedSpellCount).toBe(0);
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
    });
    // Every optional field the minimal input omitted, pinned to its exact
    // normalizeWeaponDetail default — the source of that function's cyclo 15
    // (14 `??` fallbacks + 1). Read from the snapshot (#1649) — weaponDetail's
    // own table is gone.
    expect(readInventorySnapshot(created).weapon).toEqual({
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
    // The acquire op never authors capabilities, so the weapon's own snapshot
    // (already validated) carries `capabilities: []` — patch one in directly
    // (#1649: there's no "add a capability" application op, so this test adds
    // it the way an award/undo path would, keyed the same way).
    const capId = randomUUID();
    const currentSnapshot = readInventorySnapshot(weapon);
    await prisma.inventoryItem.update({
      where: { id: weapon.id },
      data: {
        snapshot: {
          ...currentSnapshot,
          capabilities: [{ key: capId, kind: "passiveBonus", target: "skill", targetKey: "athletics", op: "add", value: 1 }],
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await prisma.inventoryCapabilityUse.create({ data: { inventoryItemId: weapon.id, capabilityKey: capId, used: 0 } });

    // Bag-only gear item (declares a wearable slot, unequipped) — the opposite
    // branch of every optional field above, plus the `slot` fallback.
    await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({ characterId: "serial-char-e", name: "Boots of Testing", category: "gear", slot: "FEET", position: 1 }),
    });
    // Hits serializeInventoryItem's armorDetail branch.
    await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId: "serial-char-e",
        name: "Traveler's Leather",
        category: "armor",
        position: 2,
        armor: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true },
      }),
    });
    // Hits serializeInventoryItem's consumableDetail branch.
    await prisma.inventoryItem.create({
      data: inventoryItemFixtureData({
        characterId: "serial-char-e",
        name: "Potion of Testing",
        category: "consumable",
        quantity: 3,
        position: 3,
        consumable: { effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 0, effectDescription: "Heals 2d4.", maxUses: 1, usesRemaining: 1 },
      }),
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
        weaponBonded: false,
        requiresAttunement: true,
        attunementPrereqKind: "class",
        attunementPrereqValue: "Fighter",
        attunementPrereqText: "a Fighter",
        notes: "Keep polished.",
        equippable: true,
        allowedSlots: ["MAIN_HAND", "OFF_HAND"],
        // Served flags (#1433). `proficient` is true where attackBonusComponents
        // withholds the proficiency bonus: this weapon has no weaponClass, and
        // the no-warn display policy differs from the attack rule on purpose.
        proficient: true,
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
          attackBonusComponents: { abilityMod: 3, proficiencyBonus: 0, rangedBonus: 0, attackRollBonus: 0, ability: "strength" },
          damage: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 3, abilityModifier: 3, meleeDamageBonus: 0, damageType: "slashing", grip: "one-handed", ability: "strength" },
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
        weaponBonded: false,
        requiresAttunement: false,
        // Worn gear: placeable but not equippable — the two flags are separate rules.
        equippable: false,
        allowedSlots: ["FEET"],
        proficient: true,
      },
      {
        id: expect.any(String),
        name: "Traveler's Leather",
        category: "armor",
        quantity: 1,
        equipped: false,
        attuned: false,
        weaponBonded: false,
        requiresAttunement: false,
        equippable: true,
        allowedSlots: ["BODY"],
        // False because this fixture's class is a suite-local CharacterClass row
        // whose armorProficiencies column is left at its [] default (#1529).
        proficient: false,
        armor: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true, stealthDisadvantage: false },
      },
      {
        id: expect.any(String),
        name: "Potion of Testing",
        category: "consumable",
        quantity: 3,
        equipped: false,
        attuned: false,
        weaponBonded: false,
        requiresAttunement: false,
        equippable: false,
        allowedSlots: [],
        proficient: true,
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
