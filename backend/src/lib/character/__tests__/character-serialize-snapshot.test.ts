// Behavior lock for the #1003 serializer split: full-object snapshots of
// serializeCharacter over two deterministic fixtures. Must stay green UNEDITED
// while the builders move into lib/character/serialize/*.
//
// #1341 audit: every class-entry `name` here must match the rule registries
// that gate mechanical derivation off it. DERIVED_ACTIONS (matchesActionGate),
// CLASSES (deriveResources), and the ASI/fighting-style/caster-fraction/
// extra-attack tables all lowercase before lookup, so both fixtures' lowercase
// entry names ("fighter"/"wizard") match them correctly. CLASS_PROFICIENCY_GRANTS
// is the one exception: it's keyed on the capitalized catalog display name
// ("Fighter"/"Wizard") and looked up case-sensitively, so both fixtures miss it
// — a real production defect (#1388), not fixed here because correcting it
// would change both fixtures' derived proficiency and weapon-attack values.
//
// #1322 audit: both fixtures are EDITION_2024 (the default), so
// `exhaustionEffectText`'s +1-line-per-fixture delta never exercises the 2014
// fork — that coverage lives in exhaustion-edition.test.ts, which asserts both
// editions end to end. Don't add a 2014 fixture here to compensate: per #1341,
// the conditions/rollModifiers/speed fields these fixtures already lock would
// become byte-identical copies with a forked exhaustion string bolted on,
// diluting this file's signal for no new information.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

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
  // Fixed id so the classes view's classId snapshots deterministically.
  const fighter = await prisma.characterClass.create({
    data: { id: "class-snap-fighter", name: FIGHTER_CLASS_NAME, hitDie: "d10", savingThrows: ["strength", "constitution"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false, subclassLevel: 3 },
  });
  fighterClassId = fighter.id;
  const wizard = await prisma.characterClass.create({
    data: { id: "class-snap-wizard", name: WIZARD_CLASS_NAME, hitDie: "d6", savingThrows: ["intelligence", "wisdom"], skillChoiceCount: 2, skillChoices: ["arcana"], isSpellcaster: true, subclassLevel: 2 },
  });
  wizardClassId = wizard.id;

  // #1524: this fixture deliberately uses bespoke CharacterClass rows (fixed
  // ids, for classId snapshot determinism) instead of the real seeded Fighter/
  // Wizard rows, whose ids are fresh UUIDs per reseed. Now that feature TEXT
  // is DB-linked via classId/subclassId (ClassFeature), these bespoke classes
  // need their own ClassFeature rows too — text copied verbatim from the real
  // seeded Fighter/Battle Master/Wizard EDITION_2024 rows (both fixtures below
  // are EDITION_2024, the default) so the snapshot's pinned feature content
  // still reflects production text, not a fixture-only string.
  const battleMaster = await prisma.subclass.create({
    data: { id: "subclass-snap-battle-master", classId: fighterClassId, name: "Test Battle Master (Snapshot Suite)", description: "Test fixture subclass.", slug: "battle-master" },
  });
  battleMasterSubclassId = battleMaster.id;

  await prisma.classFeature.createMany({
    data: [
      { classId: fighterClassId, subclassId: null, name: "Fighting Style", level: 1, edition: "EDITION_2024", description: "Choose a fighting style specialty: Archery (+2 ranged attack rolls), Defense (+1 AC in armor), Dueling (+2 melee damage when only wielding one weapon), Great Weapon Fighting (reroll 1s and 2s on damage with two-handed weapons), Protection (impose disadvantage on attacks against adjacent allies), or Two-Weapon Fighting (add ability modifier to off-hand damage)." },
      // Second Wind/Action Surge (#1528): resource + activation + cost columns
      // populated too, mirroring prisma/seed/fighter-features.ts's real values
      // — Second Wind is a selectable action this suite's own snapshot pins
      // (see the availableActions assertion below), so an empty descriptor
      // set would silently drop it from the wire again.
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
      { classId: fighterClassId, subclassId: null, name: "Extra Attack", level: 5, edition: "EDITION_2024", description: "You can attack twice when taking the Attack action. Three times at level 11; four times at level 20." },
      { classId: fighterClassId, subclassId: battleMasterSubclassId, name: "Combat Superiority", level: 3, edition: "EDITION_2024", description: "You learn maneuvers fueled by superiority dice (d8s). You have 4 dice and regain all expended dice on a short or long rest. Maneuvers can only be used once per attack unless otherwise stated." },
      { classId: fighterClassId, subclassId: battleMasterSubclassId, name: "Student of War", level: 3, edition: "EDITION_2024", description: "You gain proficiency with one type of artisan's tools of your choice." },
      { classId: wizardClassId, subclassId: null, name: "Spellcasting", level: 1, edition: "EDITION_2024", description: "You cast spells using Intelligence. Full-caster progression. You copy spells into your spellbook and prepare a number equal to your Intelligence modifier + your wizard level (minimum 1) after each long rest." },
      { classId: wizardClassId, subclassId: null, name: "Arcane Recovery", level: 1, edition: "EDITION_2024", description: "Once per day when finishing a short rest, choose expended spell slots to recover. Total levels of slots recovered can be up to half your wizard level (rounded up, max 5th-level slots)." },
    ],
  });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
  await prisma.characterClass.deleteMany({ where: { name: { in: [FIGHTER_CLASS_NAME, WIZARD_CLASS_NAME] } } });
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
          { id: "buff-charm", key: "item:inv-charm", target: "speed", modifier: 10, source: "Charm of the Snapshot", duration: "until-rest", restType: "long" },
          { id: "buff-chant", key: "spell:sp-chant", target: "athletics", modifier: 2, source: "Heroic Chant", duration: "concentration", rollEffects: [{ mode: "advantage", kind: "save", ability: "strength" }] },
        ],
      },
      resources: {
        used: {},
        // Stored but never serialized: the wire expresses the choice through
        // fightingStyleSlots + advancements (#1137), so this legacy scalar is
        // ignored rather than clamped — no fightingStyle key appears in the
        // snapshot at all. Kept to prove a stale stored value stays invisible.
        fightingStyle: "defense",
        advancements: [
          { id: "adv-tough", level: 4, kind: "feat", abilityDeltas: {}, hpDelta: 0, initDelta: 0, featName: "Tough", featDescription: "Sturdy.", improvements: [{ target: "maxHp", amount: 2, perLevel: true }] },
          { id: "adv-over", level: 8, kind: "asi", abilityDeltas: { dexterity: 2 }, hpDelta: 6, initDelta: 1 }, // over-cap, reversed on read
        ],
      },
      classEntries: {
        create: [
          { id: "ce-snap-wiz", name: "wizard", classId: wizardClassId, position: 0, level: 5 },
          // name must match a DERIVED_ACTIONS grantClass ("fighter") or
          // availableActions[] is structurally empty and this snapshot can't
          // regress — #1315's entry-scoping fix shipped with zero snapshot
          // coverage because of that (#1341). The CATALOG row keeps its
          // distinctive name: it's @unique and deleteMany'd by it for isolation.
          { id: "ce-snap-ftr", name: "fighter", classId: fighterClassId, position: 1, level: 1 },
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
      classEntries: { create: [{ id: "ce-snap-simple", name: "fighter", classId: fighterClassId, position: 0, level: 5, subclass: "battle master", subclassId: battleMasterSubclassId }] },
    },
  });
}

describe("serializeCharacter snapshot lock (#1003)", () => {
  it("multiclass caster with inventory, conditions, buffs and over-cap advancements", async () => {
    await createMulticlassCaster();
    const serialized = await serialize("snap-char-multi");
    // #1341: pinned outside the snapshot too, so a primary-entry-only regression
    // (#1315's widest behavioural change) fails with a readable diff instead of
    // one line inside a 500-line blob. Fighter is the SECONDARY entry at its own
    // level 1 — Second Wind is the only row fighter 1 grants. `reminder`/
    // `resolverKind` (#1528) are the row-driven descriptor's own contribution
    // — reminder is server-computed from the row's effect columns (never a
    // second hand-authored string), and resolverKind names the client's
    // inline tool without a hand-authored ACTION_RESOLVERS entry.
    expect(serialized.availableActions).toEqual([
      {
        key: "secondWind", name: "Second Wind", cost: "bonusAction", enabled: true,
        reminder: "Regain 1d10 + 1 HP", resolverKind: "heal-roll",
      },
    ]);
    expect(serialized).toMatchSnapshot();
  });

  it("single-class non-caster control with resource clamps", async () => {
    await createSimpleFighter();
    expect(await serialize("snap-char-simple")).toMatchSnapshot();
  });
});
