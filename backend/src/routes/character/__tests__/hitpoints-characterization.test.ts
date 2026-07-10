/**
 * Characterization lock for the HP transaction event stream (#614).
 *
 * The ~280-line dispatcher in lib/combat/hitpoints.ts (applyHitPointOperations) is the
 * sole emitter of HP audit events: per op it writes ONE `hitPoints` event whose
 * before/after sub-state is assembled by a chain of conditional blocks, then may
 * append follow-on events (rest buff-clears, while-active clears, a
 * concentration check) sharing the batchId. This oracle pins the EXACT emitted
 * stream — per-op event count, ordered types, category, summary, before/after,
 * and data — so the phase-helper decomposition is provably byte-identical. It
 * must be green now and stay green UNEDITED after the refactor.
 *
 * The load-bearing risks it guards:
 *  - the before/after key assembly (hitPoints/hitDice always; spellcasting +
 *    resources on longRest; classEntryLevel on levelUp);
 *  - the follow-on ordering: main hitPoints event THEN concentration event.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-hp-char";
let COOKIE: string;
const app = createApp();

const BASE_ABILITY = { strength: 10, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 };
const BASE = {
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  abilityScores: BASE_ABILITY,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

const CLASS_NAME = "Test Fighter (HP Char Suite)";
let fighterClassId: string;

async function postHp(id: string, body: object) {
  return supertest(app).post(`/api/characters/${id}/hp`).set("Cookie", COOKIE).send(body);
}
async function events(id: string) {
  return prisma.characterEvent.findMany({ where: { characterId: id }, orderBy: { createdAt: "asc" as const } });
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  const fighter = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d10", savingThrows: ["strength", "constitution"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false, subclassLevel: 3 },
    update: {},
  });
  fighterClassId = fighter.id;
});
afterAll(async () => {
  await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
});
afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "HPChar" } } });
});

// Level-5 fighter (XP 6500), 10/44 HP, 3 of 5 hit dice spent.
async function createPlain(id: string, overrides: Record<string, unknown> = {}) {
  return prisma.character.create({
    data: {
      ...BASE,
      ownerId: OWNER_ID,
      id,
      name: `HPChar ${id}`,
      experiencePoints: 6500,
      hitPoints: { current: 10, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 5, die: "d10", spent: 3 },
      spellcasting: Prisma.JsonNull,
      classEntries: { create: [{ name: CLASS_NAME, classId: fighterClassId, position: 0, level: 5 }] },
      ...overrides,
    },
  });
}

describe("HP transaction event-stream characterization (#614)", () => {
  it("damage: single hitPoints event, exact payload", async () => {
    await createPlain("hp-damage");
    const res = await postHp("hp-damage", { operations: [{ type: "damage", amount: 8 }] });
    expect(res.status).toBe(200);

    const evs = await events("hp-damage");
    expect(evs).toHaveLength(1);
    const [ev] = evs;
    expect(ev.category).toBe("hitPoints");
    expect(ev.type).toBe("damage");
    expect(ev.summary).toBe("Took 8 damage (10 → 2 HP)");
    expect(ev.data).toEqual({ amount: 8, rawAmount: 8, damageType: null, resisted: false, immune: false });
    expect(ev.before).toEqual({ hitPoints: { current: 10, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } }, hitDice: { total: 5, die: "d10", spent: 3 } });
    expect(ev.after).toEqual({ hitPoints: { current: 2, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } }, hitDice: { total: 5, die: "d10", spent: 3 } });
  });

  it("heal: single hitPoints event, exact payload", async () => {
    await createPlain("hp-heal");
    const res = await postHp("hp-heal", { operations: [{ type: "heal", amount: 5 }] });
    expect(res.status).toBe(200);

    const evs = await events("hp-heal");
    expect(evs).toHaveLength(1);
    expect(evs[0].summary).toBe("Healed 5 HP (10 → 15 HP)");
    expect(evs[0].data).toEqual({ amount: 5 });
    expect(evs[0].before).toEqual({ hitPoints: { current: 10, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } }, hitDice: { total: 5, die: "d10", spent: 3 } });
    expect(evs[0].after).toEqual({ hitPoints: { current: 15, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } }, hitDice: { total: 5, die: "d10", spent: 3 } });
  });

  it("setTemp: single hitPoints event, exact payload", async () => {
    await createPlain("hp-temp");
    const res = await postHp("hp-temp", { operations: [{ type: "setTemp", amount: 7 }] });
    expect(res.status).toBe(200);

    const evs = await events("hp-temp");
    expect(evs).toHaveLength(1);
    expect(evs[0].summary).toBe("Set temporary HP to 7");
    expect(evs[0].data).toEqual({ amount: 7 });
    expect(evs[0].before).toEqual({ hitPoints: { current: 10, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } }, hitDice: { total: 5, die: "d10", spent: 3 } });
    expect(evs[0].after).toEqual({ hitPoints: { current: 10, max: 44, temp: 7, deathSaves: { successes: 0, failures: 0 } }, hitDice: { total: 5, die: "d10", spent: 3 } });
  });

  it("deathSave: single hitPoints event", async () => {
    await createPlain("hp-death", { hitPoints: { current: 0, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } } });
    const res = await postHp("hp-death", { operations: [{ type: "deathSave", roll: 12 }] });
    expect(res.status).toBe(200);

    const evs = await events("hp-death");
    expect(evs).toHaveLength(1);
    expect(evs[0].type).toBe("deathSave");
    expect(evs[0].summary).toBe("Death save: rolled 12 (1 success, 0 failures)");
    expect(evs[0].data).toEqual({ roll: 12 });
    expect(evs[0].before).toEqual({ hitPoints: { current: 0, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } }, hitDice: { total: 5, die: "d10", spent: 3 } });
    expect(evs[0].after).toEqual({ hitPoints: { current: 0, max: 44, temp: 0, deathSaves: { successes: 1, failures: 0 } }, hitDice: { total: 5, die: "d10", spent: 3 } });
  });

  it("stabilize: single hitPoints event", async () => {
    await createPlain("hp-stab", { hitPoints: { current: 0, max: 44, temp: 0, deathSaves: { successes: 1, failures: 2 } } });
    const res = await postHp("hp-stab", { operations: [{ type: "stabilize" }] });
    expect(res.status).toBe(200);

    const evs = await events("hp-stab");
    expect(evs).toHaveLength(1);
    expect(evs[0].type).toBe("stabilize");
    expect(evs[0].summary).toBe("Stabilized");
    expect(evs[0].data).toEqual({});
    expect(evs[0].before).toEqual({ hitPoints: { current: 0, max: 44, temp: 0, deathSaves: { successes: 1, failures: 2 } }, hitDice: { total: 5, die: "d10", spent: 3 } });
    expect(evs[0].after).toEqual({ hitPoints: { current: 0, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } }, hitDice: { total: 5, die: "d10", spent: 3 } });
  });

  it("longRest: single hitPoints event, assembles spellcasting + resources into before/after", async () => {
    await createPlain("hp-long");
    const res = await postHp("hp-long", { operations: [{ type: "longRest" }] });
    expect(res.status).toBe(200);

    const evs = await events("hp-long");
    expect(evs).toHaveLength(1);
    const [ev] = evs;
    expect(ev.type).toBe("longRest");
    expect(ev.summary).toBe("Long rest — +34 HP");
    expect(ev.data).toEqual({ recovered: 2, hpRestored: 34, slotsRestored: 0, resourcesRestored: 0, itemSpellsRestored: 0 });
    // before/after assemble hitPoints + hitDice + spellcasting + resources.
    expect(ev.before).toEqual({
      hitPoints: { current: 10, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 5, die: "d10", spent: 3 },
      spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
      resources: { used: {}, maneuversKnown: [], disciplinesKnown: [], toolProficienciesKnown: [], advancements: [], fightingStyle: null },
    });
    expect(ev.after).toEqual({
      hitPoints: { current: 44, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 5, die: "d10", spent: 1 },
      spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
      resources: { used: {}, maneuversKnown: [], disciplinesKnown: [], toolProficienciesKnown: [], advancements: [], fightingStyle: null },
    });
  });

  it("shortRest: single hitPoints event", async () => {
    await createPlain("hp-short");
    const res = await postHp("hp-short", { operations: [{ type: "shortRest", rolls: [6] }] });
    expect(res.status).toBe(200);

    const evs = await events("hp-short");
    expect(evs).toHaveLength(1);
    const [ev] = evs;
    expect(ev.type).toBe("shortRest");
    // current 10 + roll 6 + conMod 2 = 18; one hit die spent (3→4).
    expect((ev.after as { hitPoints: { current: number }; hitDice: { spent: number } }).hitPoints.current).toBe(18);
    expect((ev.after as { hitDice: { spent: number } }).hitDice.spent).toBe(4);
    expect(ev.summary).toBe("Short rest — spent 1 hit die: +8 HP");
  });

  it("levelUp: single hitPoints event, captures classEntryLevel diff", async () => {
    // Class entry + hitDice at level 4, but XP derives level 5 → a pending level-up.
    await createPlain("hp-levelup", {
      hitDice: { total: 4, die: "d10", spent: 0 },
      hitPoints: { current: 34, max: 34, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      classEntries: { create: [{ name: CLASS_NAME, classId: fighterClassId, position: 0, level: 4 }] },
    });
    const res = await postHp("hp-levelup", { operations: [{ type: "levelUp", method: "average" }] });
    expect(res.status).toBe(200);

    const evs = await events("hp-levelup");
    expect(evs).toHaveLength(1);
    const [ev] = evs;
    expect(ev.type).toBe("levelUp");
    expect((ev.before as { classEntryLevel: number | null }).classEntryLevel).toBe(4);
    expect((ev.after as { classEntryLevel: number | null }).classEntryLevel).toBe(5);
    expect(ev.summary).toBe("Leveled up to 5 (+8 HP)");
  });

  // The follow-on ordering the phase decomposition most endangers: the main
  // hitPoints event is emitted BEFORE the concentration event, sharing batchId.
  // Damage to exactly 0 HP drops concentration deterministically (no random save).
  it("damage to 0 HP while concentrating: [damage, concentrationDropped] in order", async () => {
    await createPlain("hp-conc", {
      hitPoints: { current: 6, max: 20, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      spellcasting: {
        slotsUsed: {}, arcanumUsed: {},
        spells: [{ id: "conc-1", name: "Fixture Bless", level: 1, school: "enchantment", prepared: true, castingTime: "1 action", range: "30 ft", duration: "Concentration, up to 1 minute", description: "Bless.", concentration: true }],
        concentratingOn: { entryId: "conc-1", spellName: "Fixture Bless" },
      },
    });
    const res = await postHp("hp-conc", { operations: [{ type: "damage", amount: 6 }] });
    expect(res.status).toBe(200);

    const evs = await events("hp-conc");
    expect(evs.map((e) => e.type)).toEqual(["damage", "concentrationDropped"]);
    expect(evs.map((e) => e.category)).toEqual(["hitPoints", "spellcasting"]);
    // Same batch → LIFO undo reverses HP + concentration together.
    expect(evs[0].batchId).toBe(evs[1].batchId);
    expect(evs[0].batchId).toBeTruthy();

    const [dmg, drop] = evs;
    expect((dmg.after as { hitPoints: { current: number } }).hitPoints.current).toBe(0);
    expect((drop.before as { spellcasting: { concentratingOn: unknown } }).spellcasting.concentratingOn)
      .toEqual({ entryId: "conc-1", spellName: "Fixture Bless" });
    expect((drop.after as { spellcasting: { concentratingOn: unknown } }).spellcasting.concentratingOn).toBeNull();
    expect(drop.summary).toBe("Concentration on Fixture Bless dropped (dropped to 0 HP)");
  });
});

/**
 * Rest/level-up branch pins (#684) — the branches the shortRest/longRest/
 * levelUp/snapshot decomposition most endangers, unpinned by the block above:
 * Warlock Pact-slot restore, subclass resource resets, item castSpell resets
 * (+ attunement gating), deterministic charge-pool recharge, consumable
 * recharge, the shortRest before-only resources asymmetry, and the three
 * levelUp target payloads. Deliberately deterministic: no rechargeDice pools,
 * one item per test (DB row order is unordered), client-supplied rolls.
 * Same contract as the block above: green now, UNEDITED through the refactor.
 */
describe("rest/level-up branch pins (#684)", () => {
  const WIZ_CLASS = "Test Wizard (HP684 Suite)";
  let wizClassId: string;

  const EMPTY_RESOURCES = {
    used: {},
    maneuversKnown: [],
    disciplinesKnown: [],
    toolProficienciesKnown: [],
    advancements: [],
    fightingStyle: null,
  };
  const BASE_HP = { current: 10, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } };
  const BASE_HD = { total: 5, die: "d10", spent: 3 };

  beforeAll(async () => {
    const wiz = await prisma.characterClass.upsert({
      where: { name: WIZ_CLASS },
      create: { name: WIZ_CLASS, hitDie: "d6", savingThrows: ["intelligence"], skillChoiceCount: 2, skillChoices: ["arcana"], isSpellcaster: true, subclassLevel: 2 },
      update: {},
    });
    wizClassId = wiz.id;
  });
  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: WIZ_CLASS } });
  });

  it("shortRest as Warlock: Pact slots cleared, arcanum + concentration preserved, before-only resources", async () => {
    await createPlain("hp684-wlk", {
      classEntries: { create: [{ name: "Warlock", position: 0, level: 5 }] },
      spellcasting: {
        slotsUsed: { "1": 2 },
        arcanumUsed: { "6": 1 },
        spells: [],
        concentratingOn: { entryId: "conc-684", spellName: "Test Hex" },
      },
    });
    const res = await postHp("hp684-wlk", { operations: [{ type: "shortRest", rolls: [6] }] });
    expect(res.status).toBe(200);

    const evs = await events("hp684-wlk");
    expect(evs).toHaveLength(1);
    const [ev] = evs;
    expect(ev.summary).toBe("Short rest — spent 1 hit die: +8 HP, 2 Pact slots restored");
    expect(ev.data).toEqual({
      rolls: [6], totalGain: 8, conMod: 2,
      resourcesRestored: 0, slotsRestored: 2, itemSpellsRestored: 0,
    });
    expect(ev.before).toEqual({
      hitPoints: BASE_HP,
      hitDice: BASE_HD,
      resources: EMPTY_RESOURCES,
      spellcasting: {
        slotsUsed: { "1": 2 },
        arcanumUsed: { "6": 1 },
        spells: [],
        concentratingOn: { entryId: "conc-684", spellName: "Test Hex" },
      },
    });
    // The asymmetry: shortRest lifts resources into before ONLY — after has no
    // resources key. Slots cleared; arcanum and concentration preserved.
    expect(ev.after).toEqual({
      hitPoints: { ...BASE_HP, current: 18 },
      hitDice: { ...BASE_HD, spent: 4 },
      spellcasting: {
        slotsUsed: {},
        arcanumUsed: { "6": 1 },
        spells: [],
        concentratingOn: { entryId: "conc-684", spellName: "Test Hex" },
      },
    });
  });

  it("shortRest as Battle Master: short-or-long resource pools reset", async () => {
    await createPlain("hp684-bm", {
      classEntries: { create: [{ name: "Fighter", subclass: "Battle Master", position: 0, level: 5 }] },
      resources: { used: { superiorityDice: 3 } },
    });
    const res = await postHp("hp684-bm", { operations: [{ type: "shortRest", rolls: [6] }] });
    expect(res.status).toBe(200);

    const evs = await events("hp684-bm");
    expect(evs).toHaveLength(1);
    const [ev] = evs;
    expect(ev.summary).toBe("Short rest — spent 1 hit die: +8 HP, resources restored");
    expect(ev.data).toEqual({
      rolls: [6], totalGain: 8, conMod: 2,
      resourcesRestored: 3, slotsRestored: 0, itemSpellsRestored: 0,
    });
    expect(ev.before).toEqual({
      hitPoints: BASE_HP,
      hitDice: BASE_HD,
      resources: { ...EMPTY_RESOURCES, used: { superiorityDice: 3 } },
    });
    // Non-Warlock: no spellcasting key either — hitPoints + hitDice only.
    expect(ev.after).toEqual({
      hitPoints: { ...BASE_HP, current: 18 },
      hitDice: { ...BASE_HD, spent: 4 },
    });

    const row = await prisma.character.findUniqueOrThrow({ where: { id: "hp684-bm" }, select: { resources: true } });
    expect((row.resources as { used: Record<string, number> }).used.superiorityDice).toBe(0);
  });

  it("longRest with used slots + arcanum + concentration: all restored, concentration dropped", async () => {
    await createPlain("hp684-lr", {
      classEntries: { create: [{ name: "Wizard", position: 0, level: 5 }] },
      spellcasting: {
        slotsUsed: { "1": 2, "2": 1 },
        arcanumUsed: { "6": 1 },
        spells: [],
        concentratingOn: { entryId: "conc-684-lr", spellName: "Test Haste" },
      },
    });
    const res = await postHp("hp684-lr", { operations: [{ type: "longRest" }] });
    expect(res.status).toBe(200);

    const evs = await events("hp684-lr");
    expect(evs).toHaveLength(1);
    const [ev] = evs;
    expect(ev.summary).toBe("Long rest — +34 HP, 4 slots restored");
    expect(ev.data).toEqual({ recovered: 2, hpRestored: 34, slotsRestored: 4, resourcesRestored: 0, itemSpellsRestored: 0 });
    expect(ev.before).toEqual({
      hitPoints: BASE_HP,
      hitDice: BASE_HD,
      resources: EMPTY_RESOURCES,
      spellcasting: {
        slotsUsed: { "1": 2, "2": 1 },
        arcanumUsed: { "6": 1 },
        spells: [],
        concentratingOn: { entryId: "conc-684-lr", spellName: "Test Haste" },
      },
    });
    // longRest (unlike shortRest) carries resources in BOTH before and after.
    expect(ev.after).toEqual({
      hitPoints: { ...BASE_HP, current: 44 },
      hitDice: { ...BASE_HD, spent: 1 },
      resources: EMPTY_RESOURCES,
      spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
    });
  });

  it("longRest recharges limited-use consumables (#121)", async () => {
    await createPlain("hp684-cons");
    const item = await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: "hp684-cons" } },
        name: "Test Potion Bandolier (HP684)",
        category: "consumable",
        quantity: 1,
        consumableDetail: { create: { maxUses: 3, usesRemaining: 1 } },
      },
    });
    const res = await postHp("hp684-cons", { operations: [{ type: "longRest" }] });
    expect(res.status).toBe(200);

    const [ev] = await events("hp684-cons");
    expect(ev.summary).toBe("Long rest — +34 HP, consumables recharged");
    expect(ev.data).toEqual({
      recovered: 2, hpRestored: 34, slotsRestored: 0, resourcesRestored: 0,
      itemSpellsRestored: 0, consumablesRecharged: 1,
    });
    expect((ev.before as Record<string, unknown>).consumableCharges).toEqual([
      { inventoryItemId: item.id, usesRemaining: 1 },
    ]);
    expect((ev.after as Record<string, unknown>).consumableCharges).toEqual([
      { inventoryItemId: item.id, usesRemaining: 3 },
    ]);

    const detail = await prisma.inventoryConsumableDetail.findUniqueOrThrow({ where: { inventoryItemId: item.id } });
    expect(detail.usesRemaining).toBe(3);
  });

  it("shortRest recharges a fixed-bonus charge pool (#555), lifted into before/after", async () => {
    await createPlain("hp684-pool");
    const item = await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: "hp684-pool" } },
        name: "Test Wand (HP684)",
        category: "gear",
        quantity: 1,
        capabilities: {
          create: [{ kind: "charges", maxCharges: 7, rechargeTrigger: "short", rechargeBonus: 2, used: 4 }],
        },
      },
      include: { capabilities: true },
    });
    const capId = item.capabilities[0].id;
    const res = await postHp("hp684-pool", { operations: [{ type: "shortRest", rolls: [6] }] });
    expect(res.status).toBe(200);

    const [ev] = await events("hp684-pool");
    expect(ev.summary).toBe("Short rest — spent 1 hit die: +8 HP, item charges recharged");
    expect(ev.data).toEqual({
      rolls: [6], totalGain: 8, conMod: 2,
      resourcesRestored: 0, slotsRestored: 0, itemSpellsRestored: 0,
      itemChargesRecharged: 2,
    });
    expect((ev.before as Record<string, unknown>).chargePools).toEqual([
      { capabilityId: capId, itemName: "Test Wand (HP684)", used: 4 },
    ]);
    expect((ev.after as Record<string, unknown>).chargePools).toEqual([
      { capabilityId: capId, itemName: "Test Wand (HP684)", used: 2 },
    ]);

    const cap = await prisma.inventoryCapability.findUniqueOrThrow({ where: { id: capId } });
    expect(cap.used).toBe(2);
  });

  it("shortRest resets attuned item castSpell uses (#528) but not unattuned+unequipped ones", async () => {
    await createPlain("hp684-zap");
    const castCap = {
      kind: "castSpell" as const,
      spellId: "hp684-fixture-spell",
      spellName: "Test Zap",
      spellLevel: 1,
      castLevel: 1,
      castResource: "perRestShort" as const,
      castUses: 2,
      used: 2,
    };
    const attuned = await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: "hp684-zap" } },
        name: "Test Ring of Zapping (HP684)",
        category: "gear",
        quantity: 1,
        requiresAttunement: true,
        attuned: true,
        capabilities: { create: [castCap] },
      },
      include: { capabilities: true },
    });
    const stowed = await prisma.inventoryItem.create({
      data: {
        character: { connect: { id: "hp684-zap" } },
        name: "Test Stowed Rod (HP684)",
        category: "gear",
        quantity: 1,
        capabilities: { create: [castCap] },
      },
      include: { capabilities: true },
    });

    const res = await postHp("hp684-zap", { operations: [{ type: "shortRest", rolls: [6] }] });
    expect(res.status).toBe(200);

    const [ev] = await events("hp684-zap");
    expect(ev.summary).toBe("Short rest — spent 1 hit die: +8 HP, item spells restored");
    expect(ev.data).toEqual({
      rolls: [6], totalGain: 8, conMod: 2,
      resourcesRestored: 0, slotsRestored: 0, itemSpellsRestored: 2,
    });

    const attunedCap = await prisma.inventoryCapability.findUniqueOrThrow({ where: { id: attuned.capabilities[0].id } });
    expect(attunedCap.used).toBe(0);
    // Neither equipped nor attuned → the gate skips it.
    const stowedCap = await prisma.inventoryCapability.findUniqueOrThrow({ where: { id: stowed.capabilities[0].id } });
    expect(stowedCap.used).toBe(2);
  });

  it("levelUp with an existing-class target: exact payload, chosen entry's die", async () => {
    await createPlain("hp684-lvl-ex", {
      hitPoints: { current: 34, max: 34, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 4, die: "d10", spent: 0 },
      classEntries: {
        create: [
          { name: CLASS_NAME, classId: fighterClassId, position: 0, level: 3 },
          { name: WIZ_CLASS, classId: wizClassId, position: 1, level: 1 },
        ],
      },
    });
    const wizEntry = await prisma.characterClassEntry.findFirstOrThrow({
      where: { characterId: "hp684-lvl-ex", position: 1 },
    });

    const res = await postHp("hp684-lvl-ex", {
      operations: [{ type: "levelUp", method: "roll", roll: 4, target: { kind: "existing", classEntryId: wizEntry.id } }],
    });
    expect(res.status).toBe(200);

    const [ev] = await events("hp684-lvl-ex");
    expect(ev.type).toBe("levelUp");
    expect(ev.summary).toBe(`Leveled up ${WIZ_CLASS} to 2 (+6 HP)`);
    expect(ev.data).toEqual({
      method: "roll", roll: 4, conMod: 2, faces: 6, hpGain: 6,
      primaryEntryId: wizEntry.id, prevEntryLevel: 1, newEntryLevel: 2,
    });
    expect(ev.before).toEqual({
      hitPoints: { current: 34, max: 34, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 4, die: "d10", spent: 0 },
      classEntryLevel: 1,
    });
    expect(ev.after).toEqual({
      hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 5, die: "d10", spent: 0 },
      classEntryLevel: 2,
    });

    const updated = await prisma.characterClassEntry.findUniqueOrThrow({ where: { id: wizEntry.id } });
    expect(updated.level).toBe(2);
  });

  it("levelUp into a NEW class (multiclass): exact payload with created entry", async () => {
    await createPlain("hp684-lvl-new", {
      hitPoints: { current: 34, max: 34, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 4, die: "d10", spent: 0 },
      classEntries: { create: [{ name: CLASS_NAME, classId: fighterClassId, position: 0, level: 4 }] },
    });
    const res = await postHp("hp684-lvl-new", {
      operations: [{ type: "levelUp", method: "roll", roll: 5, target: { kind: "new", classId: wizClassId } }],
    });
    expect(res.status).toBe(200);

    const created = await prisma.characterClassEntry.findFirstOrThrow({
      where: { characterId: "hp684-lvl-new", position: 1 },
    });
    expect(created.name).toBe(WIZ_CLASS);
    expect(created.level).toBe(1);

    const [ev] = await events("hp684-lvl-new");
    expect(ev.summary).toBe(`Multiclassed into ${WIZ_CLASS} (level 1, +7 HP)`);
    expect(ev.data).toEqual({
      method: "roll", roll: 5, conMod: 2, faces: 6, hpGain: 7,
      primaryEntryId: null, createdClassEntryId: created.id,
      prevEntryLevel: null, newEntryLevel: 1,
    });
    expect((ev.before as Record<string, unknown>).classEntryLevel).toBeNull();
    expect((ev.after as Record<string, unknown>).classEntryLevel).toBe(1);
  });

  it("pins the rest/level-up validation error messages", async () => {
    async function expect400(id: string, op: object, message: string) {
      const res = await postHp(id, { operations: [op] });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: message });
    }

    // Base fixture: 5 total hit dice, 3 spent → 2 available; d10; no pending level-up.
    await createPlain("hp684-err");
    await expect400("hp684-err", { type: "shortRest", rolls: [5, 5, 5] }, "Cannot spend 3 hit dice; only 2 available");
    await expect400("hp684-err", { type: "shortRest", rolls: [11] }, "Hit die rolls must be between 1 and 10 (die: d10)");
    await expect400("hp684-err", { type: "levelUp", method: "average" }, "No pending level-up: already at level 5 (XP derives level 5)");
    expect(await events("hp684-err")).toHaveLength(0); // failed ops roll back without logging

    // Pending level-up (4 of 5) single-class: roll bounds; multiclass: target required.
    await createPlain("hp684-err2", {
      hitDice: { total: 4, die: "d10", spent: 0 },
      classEntries: { create: [{ name: CLASS_NAME, classId: fighterClassId, position: 0, level: 4 }] },
    });
    await expect400("hp684-err2", { type: "levelUp", method: "roll", roll: 11 }, "Roll for level-up must be between 1 and 10 (got 11)");
    await expect400(
      "hp684-err2",
      { type: "levelUp", method: "average", target: { kind: "new", classId: fighterClassId } },
      `Character already has levels in ${CLASS_NAME} — use an existing-class target`,
    );

    await createPlain("hp684-err3", {
      hitDice: { total: 4, die: "d10", spent: 0 },
      classEntries: {
        create: [
          { name: CLASS_NAME, classId: fighterClassId, position: 0, level: 3 },
          { name: WIZ_CLASS, classId: wizClassId, position: 1, level: 1 },
        ],
      },
    });
    await expect400(
      "hp684-err3",
      { type: "levelUp", method: "average" },
      "Multiclass character requires an explicit level-up target (existing or new class)",
    );
  });
});
