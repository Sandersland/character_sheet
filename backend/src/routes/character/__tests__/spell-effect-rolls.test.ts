/**
 * #1381: spell rows serve a resolved `effect` (EffectSpec) and `effectRolls`
 * (one resolved roll per castable slot level) instead of the client re-deriving
 * cantrip scaling / upcast dice / heal-modifier from the raw catalog columns.
 * Harness mirrors spellcasting.test.ts (real Postgres, supertest + createApp()).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-effect-rolls";
let COOKIE: string;

interface SpellRow {
  id: string;
  name: string;
  effect?: { effectType: string; dice?: { count: number; faces: number; modifier: number }; scaling: { mode: string; dicePerStep?: number } };
  effectRolls?: { slotLevel: number; roll: { count: number; faces: number; modifier: number } }[];
}

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}

function spells(res: { body: { spellcasting: { spells: SpellRow[] } } }): SpellRow[] {
  return res.body.spellcasting.spells;
}

// Fire Bolt cantrip + Fireball, snapshotted flat effect columns (no catalog
// dependency, mirrors FIXTURE_SPELLCASTING_JSON in spellcasting.test.ts).
const FIRE_BOLT = {
  id: "fixture-fire-bolt",
  name: "Fire Bolt",
  level: 0,
  school: "evocation",
  prepared: true,
  castingTime: "1 action",
  range: "120 ft",
  duration: "Instantaneous",
  description: "A mote of fire.",
  effectKind: "damage",
  effectDiceCount: 1,
  effectDiceFaces: 10,
  damageType: "fire",
  attackType: "attack",
  cantripScaling: true,
};

const FIREBALL = {
  id: "fixture-fireball",
  name: "Fireball",
  level: 3,
  school: "evocation",
  prepared: true,
  castingTime: "1 action",
  range: "150 ft",
  duration: "Instantaneous",
  description: "Boom.",
  effectKind: "damage",
  effectDiceCount: 8,
  effectDiceFaces: 6,
  effectModifier: 0,
  damageType: "fire",
  attackType: "save",
  saveAbility: "dexterity",
  upcastDicePerLevel: 1,
};

describe("GET /api/characters/:id — served effect + effectRolls on spell rows (#1381)", () => {
  const WIZARD_ID = "test-effect-rolls-wizard-9";

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: "Effect Rolls Test Wizard" },
      create: { name: "Effect Rolls Test Wizard", hitDie: "d6", savingThrows: ["intelligence", "wisdom"], skillChoiceCount: 2, skillChoices: ["arcana"], isSpellcaster: true },
      update: {},
    });
    await prisma.character.create({
      data: {
        id: WIZARD_ID,
        name: "Effect Rolls Wizard",
        ownerId: OWNER_ID,
        alignment: "Neutral Good",
        initiativeBonus: 1,
        speed: 30,
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        experiencePoints: 48000, // level 9 → FULL_CASTER_SLOTS[9] has levels 1-5
        abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
        hitPoints: { current: 40, max: 40, temp: 0 },
        hitDice: { total: 9, die: "d6" },
        spellcasting: { slotsUsed: {}, spells: [FIRE_BOLT, FIREBALL] } as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "wizard", classId: cls.id, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: WIZARD_ID } });
    await prisma.characterClass.deleteMany({ where: { name: "Effect Rolls Test Wizard" } });
  });

  it("a cantrip serves exactly one effectRolls entry at slotLevel 0, character-scaled", async () => {
    const res = await agent().get(`/api/characters/${WIZARD_ID}`);
    const fireBolt = spells(res).find((s) => s.name === "Fire Bolt")!;
    expect(fireBolt.effectRolls).toEqual([{ slotLevel: 0, roll: { count: 2, faces: 10, modifier: 0 } }]);
  });

  it("a leveled spell serves one entry per castable slot level, count rising by upcastDicePerLevel", async () => {
    const res = await agent().get(`/api/characters/${WIZARD_ID}`);
    const fireball = spells(res).find((s) => s.name === "Fireball")!;
    expect(fireball.effectRolls).toEqual([
      { slotLevel: 3, roll: { count: 8, faces: 6, modifier: 0 } },
      { slotLevel: 4, roll: { count: 9, faces: 6, modifier: 0 } },
      { slotLevel: 5, roll: { count: 10, faces: 6, modifier: 0 } },
    ]);
  });

  it("spell rows serve the resolved effect spec", async () => {
    const res = await agent().get(`/api/characters/${WIZARD_ID}`);
    const fireball = spells(res).find((s) => s.name === "Fireball")!;
    expect(fireball.effect).toMatchObject({
      effectType: "damage",
      dice: { count: 8, faces: 6, modifier: 0 },
      scaling: { mode: "slotUpcast", dicePerStep: 1 },
    });
  });
});

describe("GET /api/characters/:id — heal modifier only on heal rows (#1381)", () => {
  const CLERIC_ID = "test-effect-rolls-cleric-1";

  const CURE_WOUNDS = {
    id: "fixture-cure-wounds",
    name: "Cure Wounds",
    level: 1,
    school: "evocation",
    prepared: true,
    castingTime: "1 action",
    range: "Touch",
    duration: "Instantaneous",
    description: "Heals.",
    effectKind: "heal",
    effectDiceCount: 2,
    effectDiceFaces: 8,
    effectModifier: 0,
  };

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: "Effect Rolls Test Cleric" },
      create: { name: "Effect Rolls Test Cleric", hitDie: "d8", savingThrows: ["wisdom", "charisma"], skillChoiceCount: 2, skillChoices: ["insight"], isSpellcaster: true },
      update: {},
    });
    await prisma.character.create({
      data: {
        id: CLERIC_ID,
        name: "Effect Rolls Cleric",
        ownerId: OWNER_ID,
        alignment: "Neutral Good",
        initiativeBonus: 1,
        speed: 30,
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        experiencePoints: 900, // level 3
        abilityScores: { strength: 12, dexterity: 10, constitution: 14, intelligence: 8, wisdom: 16, charisma: 10 },
        hitPoints: { current: 24, max: 24, temp: 0 },
        hitDice: { total: 3, die: "d8" },
        // Fireball is not a real Cleric spell — included here purely to prove
        // resolveEffectSpec never applies the heal-modifier arm to a damage row.
        spellcasting: { slotsUsed: {}, spells: [CURE_WOUNDS, FIREBALL] } as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "cleric", classId: cls.id, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CLERIC_ID } });
    await prisma.characterClass.deleteMany({ where: { name: "Effect Rolls Test Cleric" } });
  });

  it("a heal's served roll carries the spellcasting ability modifier; a damage spell's does not", async () => {
    const res = await agent().get(`/api/characters/${CLERIC_ID}`);
    const cureWounds = spells(res).find((s) => s.name === "Cure Wounds")!;
    const fireball = spells(res).find((s) => s.name === "Fireball")!;
    // WIS 16 → +3 modifier.
    expect(cureWounds.effectRolls![0].roll.modifier).toBe(3);
    expect(fireball.effectRolls!.every((e) => e.roll.modifier === 0)).toBe(true);
  });
});

describe("POST /api/characters/:id/experience — cantrip roll updates in the same response (#1381)", () => {
  const LEVELUP_ID = "test-effect-rolls-levelup";

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: "Effect Rolls Test Wizard Levelup" },
      create: { name: "Effect Rolls Test Wizard Levelup", hitDie: "d6", savingThrows: ["intelligence", "wisdom"], skillChoiceCount: 2, skillChoices: ["arcana"], isSpellcaster: true },
      update: {},
    });
    await prisma.character.create({
      data: {
        id: LEVELUP_ID,
        name: "Effect Rolls Levelup Wizard",
        ownerId: OWNER_ID,
        alignment: "Neutral Good",
        initiativeBonus: 1,
        speed: 30,
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        experiencePoints: 2700, // level 4 — below the char-level-5 cantrip breakpoint
        abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
        hitPoints: { current: 24, max: 24, temp: 0 },
        hitDice: { total: 4, die: "d6" },
        spellcasting: { slotsUsed: {}, spells: [FIRE_BOLT] } as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "wizard", classId: cls.id, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: LEVELUP_ID } });
    await prisma.characterClass.deleteMany({ where: { name: "Effect Rolls Test Wizard Levelup" } });
  });

  it("leveling up changes the cantrip effectRolls entry in the same response", async () => {
    const before = await agent().get(`/api/characters/${LEVELUP_ID}`);
    expect(spells(before).find((s) => s.name === "Fire Bolt")!.effectRolls).toEqual([
      { slotLevel: 0, roll: { count: 1, faces: 10, modifier: 0 } },
    ]);

    const res = await agent()
      .post(`/api/characters/${LEVELUP_ID}/experience`)
      .send({ operations: [{ type: "award", amount: 3800 }] }); // 2700+3800=6500 → level 5

    expect(res.status).toBe(200);
    expect(spells(res).find((s) => s.name === "Fire Bolt")!.effectRolls).toEqual([
      { slotLevel: 0, roll: { count: 2, faces: 10, modifier: 0 } },
    ]);
  });
});
