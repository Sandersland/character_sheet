/**
 * Concentration-on-damage tests (issue #41).
 *
 * When a concentrating character takes damage, the server auto-rolls a
 * Constitution saving throw (DC = max(10, floor(damage/2))). A failed save (or
 * dropping to 0 HP, which ends concentration unconditionally) clears
 * `concentratingOn` and logs a `concentrationDropped` spellcasting event.
 *
 * Rolls are server-side (Math.random), so each fixture is engineered to force a
 * deterministic outcome regardless of the d20 value:
 *   - guaranteed FAIL: enormous DC (huge damage) the save can never reach, with
 *     a max HP big enough that current stays > 0 (so reason is "damage").
 *   - guaranteed PASS: DC 10 with a save bonus >= 9 (CON 28 → +9), so even a
 *     natural 1 totals >= 10.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

const app = createApp();

const CONC = {
  entryId: "fixture-conc-entry",
  spellName: "Fixture Bless",
};

const SPELLCASTING_JSON = {
  slotsUsed: {},
  arcanumUsed: {},
  spells: [
    {
      id: CONC.entryId,
      name: CONC.spellName,
      level: 1,
      school: "enchantment",
      prepared: true,
      castingTime: "1 action",
      range: "30 ft",
      duration: "Concentration, up to 1 minute",
      description: "Bless up to three creatures.",
      concentration: true,
    },
  ],
  concentratingOn: { ...CONC },
};

// Base fixture: concentrating, average CON, large HP pool so a big damage
// instance still leaves HP > 0 (isolating the "save" path from the 0-HP path).
const FIXTURE = {
  id: "test-concentration-character-1",
  name: "Concentration Test Fixture",
  alignment: "True Neutral",
  experiencePoints: 300, // level 2 → proficiency bonus +2
  armorClass: 12,
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 200, max: 200, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 2, die: "d10", spent: 0 },
  abilityScores: {
    strength: 10,
    dexterity: 12,
    constitution: 10, // +0 conMod (worst case for the save)
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

// High-CON fixture: CON 28 → +9 modifier, so a DC-10 save always passes.
const FIXTURE_HIGH_CON = {
  ...FIXTURE,
  id: "test-concentration-character-2",
  name: "High-CON Concentration Fixture",
  abilityScores: { ...FIXTURE.abilityScores, constitution: 28 }, // +9 conMod
};

async function post(characterId: string, body: object) {
  return supertest(app).post(`/api/characters/${characterId}/hp`).send(body);
}

async function getSpellcasting(id: string): Promise<Record<string, unknown>> {
  const row = await prisma.character.findUnique({
    where: { id },
    select: { spellcasting: true },
  });
  return (row?.spellcasting ?? {}) as Record<string, unknown>;
}

describe("Concentration on damage (issue #41)", () => {
  beforeEach(async () => {
    await prisma.character.create({
      data: { ...FIXTURE, spellcasting: SPELLCASTING_JSON as Prisma.InputJsonValue },
    });
    await prisma.character.create({
      data: { ...FIXTURE_HIGH_CON, spellcasting: SPELLCASTING_JSON as Prisma.InputJsonValue },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({
      where: { id: { in: [FIXTURE.id, FIXTURE_HIGH_CON.id] } },
    });
  });

  it("failed save drops concentration and returns a 'damage' check", async () => {
    // 150 damage → DC 75; +0 save bonus → impossible to pass. HP 200 → 50 (> 0).
    const res = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 150 }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(50);

    expect(res.body.concentrationChecks).toHaveLength(1);
    const check = res.body.concentrationChecks[0];
    expect(check.reason).toBe("damage");
    expect(check.held).toBe(false);
    expect(check.dc).toBe(75);
    expect(check.damage).toBe(150);
    expect(check.saveBonus).toBe(0);
    expect(check.total).toBeLessThan(check.dc);

    // Persisted state cleared.
    const sc = await getSpellcasting(FIXTURE.id);
    expect(sc.concentratingOn).toBeNull();
  });

  it("logs a concentrationDropped event with reason 'damage' on a failed save", async () => {
    await post(FIXTURE.id, { operations: [{ type: "damage", amount: 150 }] });

    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE.id, type: "concentrationDropped" },
    });
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.category).toBe("spellcasting");
    const data = ev.data as Record<string, unknown>;
    expect(data.reason).toBe("damage");
    expect(data.droppedSpellName).toBe(CONC.spellName);
    expect(typeof data.roll).toBe("number");
    expect(data.dc).toBe(75);
    // Event must carry before/after spellcasting so the spellcasting revert works.
    const before = ev.before as Record<string, unknown>;
    const after = ev.after as Record<string, unknown>;
    expect((before.spellcasting as Record<string, unknown>).concentratingOn).not.toBeNull();
    expect((after.spellcasting as Record<string, unknown>).concentratingOn).toBeNull();
  });

  it("passed save keeps concentration and logs no drop event", async () => {
    // High-CON fixture: DC 10 (10 damage), +9 bonus → min total 10 → always passes.
    const res = await post(FIXTURE_HIGH_CON.id, {
      operations: [{ type: "damage", amount: 10 }],
    });
    expect(res.status).toBe(200);

    expect(res.body.concentrationChecks).toHaveLength(1);
    const check = res.body.concentrationChecks[0];
    expect(check.reason).toBe("damage");
    expect(check.held).toBe(true);
    expect(check.dc).toBe(10);
    expect(check.saveBonus).toBe(9);

    const sc = await getSpellcasting(FIXTURE_HIGH_CON.id);
    expect((sc.concentratingOn as Record<string, unknown>)?.spellName).toBe(CONC.spellName);

    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE_HIGH_CON.id, type: "concentrationDropped" },
    });
    expect(events).toHaveLength(0);
  });

  it("DC math: 10 damage → DC 10 (max(10, …) floor, not 5)", async () => {
    // Even on the high-CON fixture the DC reported should be 10, never 5.
    const res = await post(FIXTURE_HIGH_CON.id, {
      operations: [{ type: "damage", amount: 10 }],
    });
    expect(res.body.concentrationChecks[0].dc).toBe(10);
  });

  it("DC math: 22 damage → DC 11 (floor(22/2))", async () => {
    const res = await post(FIXTURE_HIGH_CON.id, {
      operations: [{ type: "damage", amount: 22 }],
    });
    expect(res.body.concentrationChecks[0].dc).toBe(11);
  });

  it("dropping to 0 HP clears concentration with no save (reason 'death')", async () => {
    const res = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 999 }] });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(0);

    expect(res.body.concentrationChecks).toHaveLength(1);
    const check = res.body.concentrationChecks[0];
    expect(check.reason).toBe("death");
    expect(check.held).toBe(false);
    expect(check.roll).toBeNull();
    expect(check.dc).toBeNull();

    const sc = await getSpellcasting(FIXTURE.id);
    expect(sc.concentratingOn).toBeNull();

    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE.id, type: "concentrationDropped" },
    });
    expect(events).toHaveLength(1);
    expect((events[0].data as Record<string, unknown>).reason).toBe("death");
  });

  it("not concentrating → no check is performed", async () => {
    await prisma.character.update({
      where: { id: FIXTURE.id },
      data: {
        spellcasting: {
          slotsUsed: {},
          arcanumUsed: {},
          spells: SPELLCASTING_JSON.spells,
          concentratingOn: null,
        } as Prisma.InputJsonValue,
      },
    });
    const res = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 150 }] });
    expect(res.status).toBe(200);
    expect(res.body.concentrationChecks).toHaveLength(0);
  });

  it("undo restores dropped concentration (failed save)", async () => {
    const dmg = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 150 }] });
    expect(dmg.status).toBe(200);

    // Confirm dropped.
    let sc = await getSpellcasting(FIXTURE.id);
    expect(sc.concentratingOn).toBeNull();

    // Find the batchId shared by the damage + concentration events.
    const dmgEvent = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE.id, category: "hitPoints", type: "damage" },
      orderBy: { createdAt: "desc" },
    });
    expect(dmgEvent?.batchId).toBeTruthy();

    const revert = await supertest(app).post(
      `/api/characters/${FIXTURE.id}/events/${dmgEvent!.batchId}/revert`,
    );
    expect(revert.status).toBe(200);

    // HP restored …
    expect(revert.body.hitPoints.current).toBe(200);
    // … and concentration restored.
    sc = await getSpellcasting(FIXTURE.id);
    expect((sc.concentratingOn as Record<string, unknown>)?.spellName).toBe(CONC.spellName);
  });

  it("uses CON-save proficiency bonus when proficient", async () => {
    // Add CON saving-throw proficiency to the base (CON +0) fixture. At level 2
    // proficiency bonus is +2, so the save bonus should be +2.
    await prisma.character.update({
      where: { id: FIXTURE.id },
      data: { savingThrowProficiencies: ["constitution"] },
    });
    const res = await post(FIXTURE.id, { operations: [{ type: "damage", amount: 150 }] });
    expect(res.body.concentrationChecks[0].saveBonus).toBe(2);
  });
});
