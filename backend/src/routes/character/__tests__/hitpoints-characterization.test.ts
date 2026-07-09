/**
 * Characterization lock for the HP transaction event stream (#614).
 *
 * The ~280-line dispatcher in lib/hitpoints.ts (applyHitPointOperations) is the
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

import { createApp } from "../../../app.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { ensureTestOwner } from "../../../test-support/owner.js";
import { authCookie } from "../../../test-support/auth.js";

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
