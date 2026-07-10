/**
 * Characterization lock for the cast event + spellcasting JSON (#406).
 *
 * Asserts the EXACT bytes (summary strings, event `data`, before/after
 * spellcasting snapshots) that casting produces on the current code. It is the
 * byte-parity oracle for the castAbilityInTx refactor: it must be green now and
 * stay green — UNEDITED — after applyCastSpellOp becomes a thin wrapper.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-cast-characterization";
let COOKIE: string;

// Level-5 Wizard (XP 6500) → INT 16, slots L1:4 L2:3 L3:2 (upcast headroom).
const WIZARD_ID = "test-cast-char-wizard";
const WIZARD_BASE = {
  id: WIZARD_ID,
  name: "Cast Characterization Wizard",
  alignment: "Neutral Good",
  experiencePoints: 6500,
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 20, max: 20, temp: 0 },
  hitDice: { total: 5, die: "d6" },
  abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: ["intelligence", "wisdom"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
};

const WIZARD_SPELLCASTING_JSON = {
  slotsUsed: {},
  arcanumUsed: {},
  spells: [
    {
      id: "cantrip-1", name: "Fixture Fire Bolt", level: 0, school: "evocation", prepared: true,
      castingTime: "1 action", range: "120 ft", duration: "Instantaneous", description: "1d10 fire.",
      effectKind: "damage", effectDiceCount: 1, effectDiceFaces: 10, damageType: "fire",
      attackType: "attack", cantripScaling: true,
    },
    {
      id: "missile-1", name: "Fixture Magic Missile", level: 1, school: "evocation", prepared: true,
      castingTime: "1 action", range: "120 ft", duration: "Instantaneous", description: "3d4+3 force.",
      effectKind: "damage", effectDiceCount: 3, effectDiceFaces: 4, effectModifier: 3,
      damageType: "force", upcastDicePerLevel: 1,
    },
    {
      id: "conc-1", name: "Fixture Bless", level: 1, school: "enchantment", prepared: true,
      castingTime: "1 action", range: "30 ft", duration: "Concentration, up to 1 minute",
      description: "Bless.", concentration: true,
    },
    {
      id: "conc-2", name: "Fixture Shield of Faith", level: 1, school: "abjuration", prepared: true,
      castingTime: "1 bonus action", range: "60 ft", duration: "Concentration, up to 10 minutes",
      description: "+2 AC.", concentration: true,
    },
  ],
};

async function castEvents(characterId: string, type: "castSpell" | "concentrationDropped") {
  return prisma.characterEvent.findMany({
    where: { characterId, type },
    orderBy: { createdAt: "asc" as const },
  });
}

describe("cast characterization — Wizard", () => {
  const url = `/api/characters/${WIZARD_ID}/spellcasting/transactions`;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({
      data: {
        ...WIZARD_BASE,
        ownerId: OWNER_ID,
        spellcasting: WIZARD_SPELLCASTING_JSON as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "wizard", position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: WIZARD_ID } });
  });

  it("cantrip with a roll: summary + data.slotLevel null", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url).send({ operations: [{ type: "castSpell", entryId: "cantrip-1", roll: 7 }] });
    expect(res.status).toBe(200);

    const [ev] = await castEvents(WIZARD_ID, "castSpell");
    expect(ev.summary).toBe("Cast Fixture Fire Bolt: 7 fire damage");
    expect(ev.data).toEqual({ entryId: "cantrip-1", spellName: "Fixture Fire Bolt", roll: 7, slotLevel: null });
  });

  it("leveled spell at its own level: label + data.slotLevel", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url).send({ operations: [{ type: "castSpell", entryId: "missile-1", slotLevel: 1, roll: 14 }] });
    expect(res.status).toBe(200);

    const [ev] = await castEvents(WIZARD_ID, "castSpell");
    expect(ev.summary).toBe("Cast Fixture Magic Missile (L1 slot): 14 force damage");
    expect(ev.data).toEqual({ entryId: "missile-1", spellName: "Fixture Magic Missile", roll: 14, slotLevel: 1 });
  });

  it("upcast leveled spell: upcast label + data.slotLevel", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url).send({ operations: [{ type: "castSpell", entryId: "missile-1", slotLevel: 3, roll: 20 }] });
    expect(res.status).toBe(200);

    const [ev] = await castEvents(WIZARD_ID, "castSpell");
    expect(ev.summary).toBe("Cast Fixture Magic Missile (L3 slot (upcast from L1)): 20 force damage");
    expect(ev.data).toEqual({ entryId: "missile-1", spellName: "Fixture Magic Missile", roll: 20, slotLevel: 3 });
  });

  it("utility / roll 0: no colon clause", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url).send({ operations: [{ type: "castSpell", entryId: "conc-1", slotLevel: 1, roll: 0 }] });
    expect(res.status).toBe(200);

    const [ev] = await castEvents(WIZARD_ID, "castSpell");
    expect(ev.summary).toBe("Cast Fixture Bless (L1 slot)");
    expect(ev.data).toEqual({ entryId: "conc-1", spellName: "Fixture Bless", roll: 0, slotLevel: 1 });
  });

  it("concentration displace: separate drop event + before/after snapshots", async () => {
    const app = createApp();
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(url).send({ operations: [{ type: "castSpell", entryId: "conc-1", slotLevel: 1, roll: 0 }] });
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(url).send({ operations: [{ type: "castSpell", entryId: "conc-2", slotLevel: 1, roll: 0 }] });

    const drops = await castEvents(WIZARD_ID, "concentrationDropped");
    expect(drops).toHaveLength(1);
    const drop = drops[0];
    expect(drop.summary).toBe("Concentration on Fixture Bless dropped (cast Fixture Shield of Faith)");
    expect(drop.data).toEqual({
      droppedEntryId: "conc-1", droppedSpellName: "Fixture Bless", reason: "newCast", castEntryId: "conc-2",
    });
    expect((drop.before as { spellcasting: { concentratingOn: unknown } }).spellcasting.concentratingOn)
      .toEqual({ entryId: "conc-1", spellName: "Fixture Bless" });
    expect((drop.after as { spellcasting: { concentratingOn: unknown } }).spellcasting.concentratingOn)
      .toBeNull();

    const casts = await castEvents(WIZARD_ID, "castSpell");
    const secondCast = casts[casts.length - 1];
    expect((secondCast.after as { spellcasting: { concentratingOn: unknown } }).spellcasting.concentratingOn)
      .toEqual({ entryId: "conc-2", spellName: "Fixture Shield of Faith" });
  });

  it("self-apply: HP delta + slot spend in one batch", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(url).send({
        operations: [{
          type: "castSpell", entryId: "missile-1", slotLevel: 1, roll: 4,
          apply: { target: "self", kind: "damage", amount: 4 },
        }],
      });
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(16); // 20 → 16
    const slot1 = res.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slot1.used).toBe(1);
  });
});

// ── Warlock Mystic Arcanum label ────────────────────────────────────────────

const WARLOCK_ID = "test-cast-char-warlock";
const WARLOCK_BASE = {
  id: WARLOCK_ID,
  name: "Cast Characterization Warlock",
  alignment: "Chaotic Neutral",
  experiencePoints: 85000, // level 11
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 60, max: 60, temp: 0 },
  hitDice: { total: 11, die: "d8" },
  abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
  savingThrowProficiencies: ["wisdom", "charisma"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
};

const WARLOCK_SPELLCASTING_JSON = {
  slotsUsed: {},
  arcanumUsed: {},
  spells: [
    {
      id: "arcanum-6", name: "Fixture Eyebite", level: 6, school: "necromancy", prepared: true,
      castingTime: "1 action", range: "60 ft", duration: "1 minute", description: "Frighten.",
    },
  ],
};

describe("cast characterization — Warlock Mystic Arcanum", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({
      data: {
        ...WARLOCK_BASE,
        ownerId: OWNER_ID,
        spellcasting: WARLOCK_SPELLCASTING_JSON as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "warlock", position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: WARLOCK_ID } });
  });

  it("arcanum cast: 'L6 Mystic Arcanum' label", async () => {
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE)
      .post(`/api/characters/${WARLOCK_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "castSpell", entryId: "arcanum-6", slotLevel: 6, roll: 0 }] });
    expect(res.status).toBe(200);

    const [ev] = await castEvents(WARLOCK_ID, "castSpell");
    expect(ev.summary).toBe("Cast Fixture Eyebite (L6 Mystic Arcanum)");
    expect(ev.data).toEqual({ entryId: "arcanum-6", spellName: "Fixture Eyebite", roll: 0, slotLevel: 6 });
  });
});
