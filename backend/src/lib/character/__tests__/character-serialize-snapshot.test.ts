// Must stay green UNEDITED while serializeCharacter's builders are refactored (#1003).
// Class-entry name here must be lowercase to match DERIVED_ACTIONS/CLASSES' lookup (#1341).
// Both fixtures are EDITION_2024 — the 2014 fork is covered by exhaustion-edition.test.ts; don't duplicate this file's locked fields there for no new signal (#1322/#1341).
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { battleMasterResourceRowsData } from "@/test-support/fighter-resource-rows.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { buildInventorySnapshot } from "@/lib/inventory/inventory-snapshot-build.js";
import { normalizeArmorDetail, normalizeConsumableDetail, normalizeWeaponDetail } from "@/lib/inventory/inventory-snapshot.js";

const OWNER_ID = "owner-serialize-snapshot";
const FIGHTER_CLASS_NAME = "Test Fighter (Snapshot Suite)";
const WIZARD_CLASS_NAME = "Test Wizard (Snapshot Suite)";
const CHAR_IDS = ["snap-char-multi", "snap-char-simple"];
let fighterClassId: string;
let wizardClassId: string;
let battleMasterSubclassId: string;

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
  await prisma.characterClass.deleteMany({ where: { name: { in: [FIGHTER_CLASS_NAME, WIZARD_CLASS_NAME] } } });
  // Fixed id so classId snapshots deterministically; extraAsiLevels/fightingStyleFeatLevel are Fighter's real values so the FK-only resolution (#1529) stays byte-identical with the fixture's pre-#1529 behavior.
  const fighter = await prisma.characterClass.create({
    data: {
      id: "class-snap-fighter", name: FIGHTER_CLASS_NAME, hitDie: "d10", savingThrows: ["strength", "constitution"],
      skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false, subclassLevel: 3,
      extraAsiLevels: [6, 14], fightingStyleFeatLevel: 1,
    },
  });
  fighterClassId = fighter.id;
  const wizard = await prisma.characterClass.create({
    data: { id: "class-snap-wizard", name: WIZARD_CLASS_NAME, hitDie: "d6", savingThrows: ["intelligence", "wisdom"], skillChoiceCount: 2, skillChoices: ["arcana"], isSpellcaster: true, subclassLevel: 2 },
  });
  wizardClassId = wizard.id;

  // Bespoke CharacterClass rows need their own ClassFeature rows — Battle Master's come from the shared battleMasterResourceRowsData helper so the pinned feature text still reflects production content, not a fixture-only string (#1524/#1546).
  const battleMaster = await prisma.subclass.create({
    data: { id: "subclass-snap-battle-master", classId: fighterClassId, name: "Test Battle Master (Snapshot Suite)", description: "Test fixture subclass.", slug: "battle-master" },
  });
  battleMasterSubclassId = battleMaster.id;

  await prisma.classFeature.createMany({
    data: [
      { classId: fighterClassId, subclassId: null, name: "Fighting Style", level: 1, edition: "EDITION_2024", description: "Choose a fighting style specialty: Archery (+2 ranged attack rolls), Defense (+1 AC in armor), Dueling (+2 melee damage when only wielding one weapon), Great Weapon Fighting (reroll 1s and 2s on damage with two-handed weapons), Protection (impose disadvantage on attacks against adjacent allies), or Two-Weapon Fighting (add ability modifier to off-hand damage)." },
      // resource/activation/cost columns mirror fighter-features.ts's real seeded values — an empty descriptor set would silently drop Second Wind from the wire (#1528).
      {
        classId: fighterClassId, subclassId: null, name: "Second Wind", level: 1, edition: "EDITION_2024",
        description: "As a bonus action, regain 1d10 + your fighter level HP. Regain use on a short or long rest.",
        resourceKey: "secondWind", resourceLabel: "Second Wind", resourceRecharge: "short-or-long",
        resourceTotals: [{ minLevel: 1, total: 1 }],
        activationCost: "bonusAction", resolverKind: "heal-roll",
        costKind: "pool", costPoolKey: "secondWind", costBase: 1,
        effectKind: "heal", effectDiceCount: 1, effectDiceFaces: 10, effectModifierSource: "classLevel",
      },
      {
        classId: fighterClassId, subclassId: null, name: "Action Surge", level: 2, edition: "EDITION_2024",
        description: "Take one additional action on your turn. Regain use(s) on a short or long rest. You have 2 uses starting at level 17.",
        resourceKey: "actionSurge", resourceLabel: "Action Surge", resourceRecharge: "short-or-long",
        resourceTotals: [{ minLevel: 2, total: 1 }, { minLevel: 17, total: 2 }],
        activationCost: "special", resolverKind: "simple-confirm",
        costKind: "pool", costPoolKey: "actionSurge", costBase: 1,
      },
      // derivedStat/derivedStatTiers mirror the real seeded Fighter row — without them attacksPerAction defaults to 1 (floor), silently re-baselining the snapshot (#1530).
      {
        classId: fighterClassId, subclassId: null, name: "Extra Attack", level: 5, edition: "EDITION_2024",
        description: "You can attack twice when taking the Attack action. Three times at level 11; four times at level 20.",
        derivedStat: "attacksPerAction",
        derivedStatTiers: [{ minLevel: 5, value: 2 }, { minLevel: 11, value: 3 }, { minLevel: 20, value: 4 }],
      },
      // Battle Master rows come from the shared helper (not hand-copied) — fighter entry is level 5 (< 7/10/15/18), so no higher-level Battle Master feature enters this snapshot.
      ...battleMasterResourceRowsData(fighterClassId, battleMasterSubclassId),
      // wizard.ts's resourceFn (which used to supply Arcane Recovery's pool regardless of any DB row) is deleted — this bespoke class needs its own row descriptor or the pool vanishes from the snapshot.
      { classId: wizardClassId, subclassId: null, name: "Spellcasting", level: 1, edition: "EDITION_2024", description: "You cast spells using Intelligence. Full-caster progression. You know three Wizard cantrips (one more at levels 4 and 10), replacing one on a Long Rest. Your spellbook holds your level 1+ spells: it starts with six 1st-level spells, and you add two spells of your choice whenever you gain a Wizard level after 1st. You regain all expended spell slots on a Long Rest, and you change your list of prepared spells whenever you finish a Long Rest." },
      {
        classId: wizardClassId, subclassId: null, name: "Arcane Recovery", level: 1, edition: "EDITION_2024",
        description: "When you finish a Short Rest, you can choose expended spell slots to recover, their combined level no higher than half your Wizard level (rounded up) and none 6th level or higher. You can use this feature only once per Long Rest.",
        resourceKey: "arcaneRecovery", resourceLabel: "Arcane Recovery", resourceRecharge: "longRest",
        resourceTotals: [{ minLevel: 1, total: 1 }],
      },
    ],
  });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
  await prisma.characterClass.deleteMany({ where: { name: { in: [FIGHTER_CLASS_NAME, WIZARD_CLASS_NAME] } } });
});

async function createMulticlassCaster() {
  await prisma.character.create({
    data: {
      id: "snap-char-multi",
      name: "Snapshot Multiclass Caster",
      ownerId: OWNER_ID,
      alignment: "Neutral Good",
      experiencePoints: 14000,
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
      hitDice: { total: 5, die: "d6", spent: 1 },
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
          { id: "buff-charm", key: "item:inv-charm", target: "speed", modifier: 10, source: "Charm of the Snapshot", duration: "until-rest", restType: "long" },
          { id: "buff-chant", key: "spell:sp-chant", target: "athletics", modifier: 2, source: "Heroic Chant", duration: "concentration", rollEffects: [{ mode: "advantage", kind: "save", ability: "strength" }] },
        ],
      },
      resources: {
        used: {},
        // Stored but never serialized — the wire expresses the fighting-style choice through fightingStyleSlots + advancements (#1137); kept here to prove a stale value stays invisible.
        fightingStyle: "defense",
        advancements: [
          { id: "adv-tough", level: 4, kind: "feat", abilityDeltas: {}, hpDelta: 0, initDelta: 0, featName: "Tough", featDescription: "Sturdy.", improvements: [{ target: "maxHp", amount: 2, perLevel: true }] },
          { id: "adv-over", level: 8, kind: "asi", abilityDeltas: { dexterity: 2 }, hpDelta: 6, initDelta: 1 }, // over-cap, reversed on read
        ],
      },
      classEntries: {
        create: [
          { id: "ce-snap-wiz", name: "wizard", classId: wizardClassId, position: 0, level: 5 },
          // name must match a DERIVED_ACTIONS grantClass ("fighter") or availableActions[] is structurally empty and this snapshot can't catch a regression (#1315/#1341).
          { id: "ce-snap-ftr", name: "fighter", classId: fighterClassId, position: 1, level: 1 },
        ],
      },
      inventoryItems: {
        create: [
          (() => {
            const weapon = normalizeWeaponDetail({
              damageDiceCount: 1, damageDiceFaces: 8, damageModifier: 0, damageType: "slashing",
              versatileDiceCount: 1, versatileDiceFaces: 10, weaponClass: "martial", weaponRange: "melee",
            });
            return {
              id: "inv-sword",
              name: "Snapshot Longsword",
              category: "weapon" as const,
              quantity: 1,
              position: 0,
              equippedSlot: "MAIN_HAND" as const,
              snapshot: buildInventorySnapshot({
                name: "Snapshot Longsword", category: "weapon", weight: null, cost: null, description: null,
                slot: null, rarity: null, requiresAttunement: false, attunementPrereqKind: null, attunementPrereqValue: null,
                weaponDetail: weapon, armorDetail: null, consumableDetail: null, capabilities: [],
              }) as unknown as Prisma.InputJsonValue,
            };
          })(),
          (() => {
            const armor = normalizeArmorDetail({ armorCategory: "shield", baseArmorClass: 2, dexModifierApplies: false });
            return {
              id: "inv-shield",
              name: "Snapshot Shield",
              category: "armor" as const,
              quantity: 1,
              position: 1,
              equippedSlot: "OFF_HAND" as const,
              snapshot: buildInventorySnapshot({
                name: "Snapshot Shield", category: "armor", weight: null, cost: null, description: null,
                slot: null, rarity: null, requiresAttunement: false, attunementPrereqKind: null, attunementPrereqValue: null,
                weaponDetail: null, armorDetail: armor, consumableDetail: null, capabilities: [],
              }) as unknown as Prisma.InputJsonValue,
            };
          })(),
          (() => {
            const armor = normalizeArmorDetail({ armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true });
            return {
              id: "inv-armor",
              name: "Snapshot Leather",
              category: "armor" as const,
              quantity: 1,
              position: 2,
              equippedSlot: "BODY" as const,
              snapshot: buildInventorySnapshot({
                name: "Snapshot Leather", category: "armor", weight: null, cost: null, description: null,
                slot: null, rarity: null, requiresAttunement: false, attunementPrereqKind: null, attunementPrereqValue: null,
                weaponDetail: null, armorDetail: armor, consumableDetail: null, capabilities: [],
              }) as unknown as Prisma.InputJsonValue,
            };
          })(),
          (() => {
            const caps = [
              { id: randomUUID(), kind: "passiveBonus" as const, target: "skill" as const, targetKey: "athletics", op: "add" as const, value: 1 },
              { id: randomUUID(), kind: "activatedEffect" as const, activation: "bonus" as const, target: "speed" as const, op: "add" as const, value: 10, activatedDuration: "untilRest" as const, resourceKind: "perRest" as const, resourcePeriod: "long" as const, resourceCharges: 1, durationText: "10 minutes" },
            ];
            return {
              id: "inv-charm",
              name: "Charm of the Snapshot",
              category: "gear" as const,
              quantity: 1,
              position: 3,
              slot: "NECK" as const,
              equippedSlot: "NECK" as const,
              rarity: "RARE" as const,
              activatedUsesSpent: 1,
              capabilityUses: { create: caps.map((c) => ({ capabilityKey: c.id, used: 0 })) },
              snapshot: buildInventorySnapshot({
                name: "Charm of the Snapshot", category: "gear", weight: null, cost: null, description: null,
                slot: "NECK", rarity: "RARE", requiresAttunement: false, attunementPrereqKind: null, attunementPrereqValue: null,
                weaponDetail: null, armorDetail: null, consumableDetail: null, capabilities: caps,
              }) as unknown as Prisma.InputJsonValue,
            };
          })(),
          (() => {
            const consumable = normalizeConsumableDetail({
              effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 2, effectDescription: "Heals 2d4+2.", maxUses: 1, usesRemaining: 1,
            });
            return {
              id: "inv-potion",
              name: "Potion of Snapshots",
              category: "consumable" as const,
              quantity: 2,
              position: 4,
              // Must be set on the column too, or the resolver's glued-on usesRemaining reads null (#1648).
              usesRemaining: consumable.usesRemaining,
              snapshot: buildInventorySnapshot({
                name: "Potion of Snapshots", category: "consumable", weight: null, cost: null, description: null,
                slot: null, rarity: null, requiresAttunement: false, attunementPrereqKind: null, attunementPrereqValue: null,
                weaponDetail: null, armorDetail: null, consumableDetail: consumable, capabilities: [],
              }) as unknown as Prisma.InputJsonValue,
            };
          })(),
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

async function createSimpleFighter() {
  await prisma.character.create({
    data: {
      id: "snap-char-simple",
      name: "Snapshot Simple Fighter",
      ownerId: OWNER_ID,
      alignment: "Lawful Good",
      experiencePoints: 6500,
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
      classEntries: { create: [{ id: "ce-snap-simple", name: "fighter", classId: fighterClassId, position: 0, level: 5, subclass: "battle master", subclassId: battleMasterSubclassId }] },
    },
  });
}

describe("serializeCharacter snapshot lock (#1003)", () => {
  it("multiclass caster with inventory, conditions, buffs and over-cap advancements", async () => {
    await createMulticlassCaster();
    const serialized = await serialize("snap-char-multi");
    // Pinned outside the snapshot too, for a readable diff on regression; the reminder text is server-computed from the row's effect columns, never hand-authored (#1341/#1528).
    expect(serialized.availableActions).toEqual([
      {
        key: "secondWind", name: "Second Wind", cost: "bonusAction", enabled: true,
        reminder: "Regain 1d10 + 1 HP", resolverKind: "heal-roll",
      },
      // Off-hand eligibility is served for every character (#1435); this caster holds no two-Light-weapon pair, so it's disabled.
      {
        key: "offHandAttack", name: "Off-Hand Attack", cost: "bonusAction", enabled: false,
        disabledReason: "Off-hand attack needs two Light weapons equipped.",
      },
    ]);
    expect(serialized).toMatchSnapshot();
  });

  it("single-class non-caster control with resource clamps", async () => {
    await createSimpleFighter();
    expect(await serialize("snap-char-simple")).toMatchSnapshot();
  });
});
