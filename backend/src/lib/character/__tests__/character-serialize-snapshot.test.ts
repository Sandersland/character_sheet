// Behavior lock for the #1003 serializer split: full-object snapshots of
// serializeCharacter over two deterministic fixtures. Must stay green UNEDITED
// while the builders move into lib/character/serialize/*.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

const OWNER_ID = "owner-serialize-snapshot";
const FIGHTER_CLASS_NAME = "Test Fighter (Snapshot Suite)";
const CHAR_IDS = ["snap-char-multi", "snap-char-simple"];
let fighterClassId: string;

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
  await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CLASS_NAME } });
  // Fixed id so the classes view's classId snapshots deterministically.
  const fighter = await prisma.characterClass.create({
    data: { id: "class-snap-fighter", name: FIGHTER_CLASS_NAME, hitDie: "d10", savingThrows: ["strength", "constitution"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false, subclassLevel: 3 },
  });
  fighterClassId = fighter.id;
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
  await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CLASS_NAME } });
});

// Fixture 1 — wizard 5 / fighter 1 multiclass caster: used slots + stale slot
// counts, concentration, mixed equipped inventory, an activatedEffect+passiveBonus
// item, conditions + exhaustion, buffs, over-cap advancements, journal entries.
async function createMulticlassCaster() {
  await prisma.character.create({
    data: {
      id: "snap-char-multi",
      name: "Snapshot Multiclass Caster",
      ownerId: OWNER_ID,
      alignment: "Neutral Good",
      experiencePoints: 14000, // level 6, proficiency +3
      initiativeBonus: 2,
      speed: 30,
      abilityScores: { strength: 10, dexterity: 14, constitution: 12, intelligence: 16, wisdom: 10, charisma: 8 },
      savingThrowProficiencies: ["intelligence", "wisdom"],
      skills: [
        { name: "athletics", ability: "strength", proficient: false },
        { name: "arcana", ability: "intelligence", proficient: true },
        { name: "animalHandling", ability: "wisdom", proficient: false },
      ],
      toolProficiencies: [{ name: "Herbalism Kit", source: "background" }],
      currency: { cp: 1, sp: 2, gp: 3, pp: 4 },
      hitPoints: { current: 30, max: 28, temp: 3, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 5, die: "d6", spent: 1 }, // pendingLevelUps 1
      raceSelection: { create: { name: "Elf" } },
      spellcasting: {
        slotsUsed: { "1": 2, "2": 1, "3": 5 }, // "3": 5 is stale, clamps to total
        arcanumUsed: {},
        spells: [
          { id: "sp-fireball", name: "Fireball", level: 3, school: "evocation", prepared: true, castingTime: "1 action", range: "150 feet", duration: "Instantaneous", description: "Boom." },
          { id: "sp-mage-armor", name: "Mage Armor", level: 1, school: "abjuration", prepared: false, castingTime: "1 action", range: "Touch", duration: "8 hours", description: "AC 13 + Dex." },
        ],
        concentratingOn: { entryId: "sp-fireball", spellName: "Fireball" },
      },
      conditions: {
        active: [{ key: "poisoned", source: "Spider bite", appliedAt: "2026-01-02T03:04:05.000Z" }],
        exhaustion: 2,
      },
      activeEffects: {
        buffs: [
          { id: "buff-charm", key: "item:inv-charm", target: "speed", modifier: 10, source: "Charm of the Snapshot", duration: "untilRest", restType: "long" },
          { id: "buff-chant", key: "spell:sp-chant", target: "athletics", modifier: 2, source: "Heroic Chant", duration: "concentration", rollEffects: [{ mode: "advantage", kind: "save", ability: "strength" }] },
        ],
      },
      resources: {
        used: {},
        fightingStyle: "defense", // wizard primary: clamps to null on read
        advancements: [
          { id: "adv-tough", level: 4, kind: "feat", abilityDeltas: {}, hpDelta: 0, initDelta: 0, featName: "Tough", featDescription: "Sturdy.", improvements: [{ target: "maxHp", amount: 2, perLevel: true }] },
          { id: "adv-over", level: 8, kind: "asi", abilityDeltas: { dexterity: 2 }, hpDelta: 6, initDelta: 1 }, // over-cap, reversed on read
        ],
      },
      classEntries: {
        create: [
          { id: "ce-snap-wiz", name: "wizard", position: 0, level: 5 },
          { id: "ce-snap-ftr", name: FIGHTER_CLASS_NAME, classId: fighterClassId, position: 1, level: 1 },
        ],
      },
      inventoryItems: {
        create: [
          {
            id: "inv-sword",
            name: "Snapshot Longsword",
            category: "weapon",
            quantity: 1,
            position: 0,
            equippedSlot: "MAIN_HAND",
            weaponDetail: {
              create: { damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing", versatileDiceCount: 1, versatileDiceFaces: 10, weaponClass: "martial", weaponRange: "melee" },
            },
          },
          {
            id: "inv-shield",
            name: "Snapshot Shield",
            category: "armor",
            quantity: 1,
            position: 1,
            equippedSlot: "OFF_HAND",
            armorDetail: { create: { armorCategory: "shield", baseArmorClass: 2, dexModifierApplies: false } },
          },
          {
            id: "inv-armor",
            name: "Snapshot Leather",
            category: "armor",
            quantity: 1,
            position: 2,
            equippedSlot: "BODY",
            armorDetail: { create: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true } },
          },
          {
            id: "inv-charm",
            name: "Charm of the Snapshot",
            category: "gear",
            quantity: 1,
            position: 3,
            slot: "NECK",
            equippedSlot: "NECK",
            rarity: "RARE",
            activatedUsesSpent: 1,
            capabilities: {
              create: [
                { kind: "passiveBonus", target: "skill", targetKey: "athletics", op: "add", value: 1 },
                { kind: "activatedEffect", activation: "bonus", target: "speed", op: "add", value: 10, activatedDuration: "untilRest", resourceKind: "perRest", resourcePeriod: "long", resourceCharges: 1, durationText: "10 minutes" },
              ],
            },
          },
          {
            id: "inv-potion",
            name: "Potion of Snapshots",
            category: "consumable",
            quantity: 2,
            position: 4,
            consumableDetail: {
              create: { effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 2, effectDescription: "Heals 2d4+2.", maxUses: 1, usesRemaining: 1 },
            },
          },
        ],
      },
      journalEntries: {
        create: [
          { id: "snap-j1", kind: "ENTRY", date: new Date("2026-01-05T00:00:00.000Z"), loggedAt: new Date("2026-01-05T18:30:00.000Z"), body: "We reached the tower.", visibility: "PRIVATE", authorUserId: OWNER_ID },
          { id: "snap-j2", kind: "NOTE", date: new Date("2026-01-03T00:00:00.000Z"), loggedAt: new Date("2026-01-03T12:00:00.000Z"), body: "Buy more ink.", visibility: "CAMPAIGN", authorUserId: OWNER_ID },
        ],
      },
    },
  });
}

// Fixture 2 — single-class non-caster control: battle master fighter L5 with
// over-cap resource lists (all four resource clamps) and an entitled fighting style.
async function createSimpleFighter() {
  await prisma.character.create({
    data: {
      id: "snap-char-simple",
      name: "Snapshot Simple Fighter",
      ownerId: OWNER_ID,
      alignment: "Lawful Good",
      experiencePoints: 6500, // level 5, proficiency +3
      initiativeBonus: 0,
      speed: 30,
      abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 12, charisma: 8 },
      savingThrowProficiencies: ["strength", "constitution"],
      skills: [
        { name: "athletics", ability: "strength", proficient: true },
        { name: "intimidation", ability: "charisma", proficient: false },
      ],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      hitPoints: { current: 44, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 5, die: "d10", spent: 2 },
      spellcasting: Prisma.JsonNull,
      resources: {
        used: { superiorityDice: 9 }, // clamps to pool total
        maneuversKnown: [
          { id: "m1", name: "Riposte", description: "Counter." },
          { id: "m2", name: "Trip Attack", description: "Prone." },
          { id: "m3", name: "Menacing Attack", description: "Frighten." },
          { id: "m4", name: "Precision Attack", description: "Over-cap." }, // clamped off
        ],
        toolProficienciesKnown: [
          { id: "tp1", name: "Smith's Tools" },
          { id: "tp2", name: "Leatherworker's Tools" }, // clamped off
        ],
        choicesKnown: { huntersPrey: [{ id: "ch1", name: "Colossus Slayer", description: "d8." }] }, // ungranted key, dropped
        advancements: [{ id: "adv-asi", level: 4, kind: "asi", abilityDeltas: { strength: 2 }, hpDelta: 0, initDelta: 0 }],
        fightingStyle: "defense", // entitled at fighter 5, kept
      },
      classEntries: { create: [{ id: "ce-snap-simple", name: "fighter", position: 0, level: 5, subclass: "battle master" }] },
    },
  });
}

describe("serializeCharacter snapshot lock (#1003)", () => {
  it("multiclass caster with inventory, conditions, buffs and over-cap advancements", async () => {
    await createMulticlassCaster();
    expect(await serialize("snap-char-multi")).toMatchSnapshot();
  });

  it("single-class non-caster control with resource clamps", async () => {
    await createSimpleFighter();
    expect(await serialize("snap-char-simple")).toMatchSnapshot();
  });
});
