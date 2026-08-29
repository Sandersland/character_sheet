// TEST-ONLY: these *Resolution helpers prove the served payload carries every field a TurnResolution needs, using only field reads — no arithmetic, no rule lookups. The production adapter (weaponToResolution/spellToResolution, #1832/#1833) may differ; this only pins that the inputs exist.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";
import { Prisma } from "@/generated/prisma/client.js";
import type { WeaponDetailInput } from "@/lib/inventory/item-detail-inputs.js";
import type { TurnResolution } from "@character-sheet/shared-types";

const OWNER_ID = "owner-serialize-turn-resolution";
const WIZARD_CLASS_NAME = "Turn Resolution Fixture Wizard";
const CHAR_IDS = ["turn-resolution-fighter", "turn-resolution-wizard"];

const BASE = {
  ownerId: OWNER_ID,
  alignment: "Neutral",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  savingThrowProficiencies: [] as string[],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  hitPoints: { current: 10, max: 10, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 1, die: "d8", spent: 0 },
};

let fighterClassId: string;
let wizardClassId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" }, select: { id: true } })).id;
  const wizardClass = await prisma.characterClass.upsert({
    where: { name: WIZARD_CLASS_NAME },
    create: {
      name: WIZARD_CLASS_NAME,
      hitDie: "d6",
      savingThrows: ["intelligence", "wisdom"],
      skillChoiceCount: 2,
      skillChoices: ["arcana", "history"],
      isSpellcaster: true,
    },
    update: {},
  });
  wizardClassId = wizardClass.id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
  await prisma.characterClass.deleteMany({ where: { name: WIZARD_CLASS_NAME } });
});

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

type Payload = Awaited<ReturnType<typeof serialize>>;

// Narrows buildSpellcastingView's deliberately-loose object return type — same convention catalog-entitlement-serialize.test.ts uses.
interface ServedSpell {
  id: string;
  name: string;
  level: number;
  castingTime: string;
  attackType?: "attack" | "save" | null;
  effectKind?: "damage" | "heal" | "buff" | null;
  saveAbility?: string | null;
  damageType?: string | null;
  effectRolls?: { slotLevel: number; roll: { count: number; faces: number; modifier: number } }[];
  castCost?: "action" | "bonusAction" | "reaction" | "other";
}
interface ServedSpellcasting {
  ability: string;
  spellSaveDC: number;
  spellAttackBonus: number;
  spells: ServedSpell[];
}

function spellcastingOf(payload: Payload): ServedSpellcasting {
  return payload.spellcasting as unknown as ServedSpellcasting;
}

function spellNamed(payload: Payload, name: string): ServedSpell {
  const spell = spellcastingOf(payload).spells.find((s) => s.name === name);
  if (!spell) throw new Error(`fixture spell "${name}" not found on served payload`);
  return spell;
}

const LONGSWORD: WeaponDetailInput = {
  damageDiceCount: 1,
  damageDiceFaces: 8,
  damageModifier: 0,
  damageType: "slashing",
  finesse: false,
  light: false,
  weaponClass: "martial",
  weaponRange: "melee",
};

async function createFighterWithWeapon() {
  const id = "turn-resolution-fighter";
  await prisma.character.create({
    data: {
      ...BASE,
      id,
      name: "Turn Resolution Fixture (Fighter)",
      abilityScores: { strength: 16, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
      classEntries: { create: [{ name: "Fighter", classId: fighterClassId, position: 0, level: 1 }] },
    },
  });
  await prisma.inventoryItem.create({
    data: inventoryItemFixtureData({
      characterId: id,
      name: "Longsword",
      category: "weapon",
      position: 0,
      equippedSlot: "MAIN_HAND",
      weapon: LONGSWORD,
    }),
  });
  return id;
}

function weaponResolution(payload: Payload): TurnResolution {
  const row = payload.attackRows.find((r) => r.kind === "weapon" && !r.offHand)!;
  return {
    source: row.name,
    cost: { kind: "action", attacks: payload.attacksPerAction },
    toHit: { bonus: row.attackSpec.modifier, critRange: payload.critRange },
    effect: { spec: row.damageSpec, kind: "damage", damageType: row.damageType },
  };
}

describe("TurnResolution — weapon, entirely from served AttackRow/critRange/attacksPerAction", () => {
  it("builds a complete resolution for an equipped Longsword", async () => {
    const id = await createFighterWithWeapon();
    const payload = await serialize(id);
    const resolution = weaponResolution(payload);

    expect(resolution).toEqual<TurnResolution>({
      source: "Longsword",
      cost: { kind: "action", attacks: 1 },
      toHit: { bonus: 5, critRange: 20 },
      effect: { spec: { count: 1, faces: 8, modifier: 3 }, kind: "damage", damageType: "slashing" },
    });
  });
});

const FIXTURE_SPELLCASTING = {
  slotsUsed: {},
  spells: [
    {
      id: "fixture-attack-cantrip",
      name: "Fixture Fire Bolt",
      level: 0,
      school: "evocation",
      prepared: true,
      castingTime: "1 action",
      range: "120 ft",
      duration: "Instantaneous",
      description: "Attack-roll shape.",
      effectKind: "damage",
      effectDiceCount: 1,
      effectDiceFaces: 10,
      damageType: "fire",
      attackType: "attack",
      cantripScaling: true,
    },
    {
      id: "fixture-save-cantrip",
      name: "Fixture Sacred Flame",
      level: 0,
      school: "evocation",
      prepared: true,
      castingTime: "1 action",
      range: "60 ft",
      duration: "Instantaneous",
      description: "Save shape.",
      effectKind: "damage",
      effectDiceCount: 1,
      effectDiceFaces: 8,
      damageType: "radiant",
      attackType: "save",
      saveAbility: "dexterity",
      saveEffect: "none",
      cantripScaling: true,
    },
    {
      id: "fixture-autohit-spell",
      name: "Fixture Magic Missile",
      level: 1,
      school: "evocation",
      prepared: true,
      castingTime: "1 action",
      range: "120 ft",
      duration: "Instantaneous",
      description: "Auto-hit shape.",
      effectKind: "damage",
      effectDiceCount: 3,
      effectDiceFaces: 4,
      effectModifier: 3,
      damageType: "force",
      upcastDicePerLevel: 1,
    },
    {
      id: "fixture-noroll-spell",
      name: "Fixture Druidcraft",
      level: 0,
      school: "transmutation",
      prepared: true,
      castingTime: "1 action",
      range: "30 ft",
      duration: "Instantaneous",
      description: "No-roll shape — no effect at all.",
    },
    {
      id: "fixture-heal-spell",
      name: "Fixture Cure Wounds",
      level: 1,
      school: "evocation",
      prepared: true,
      castingTime: "1 action",
      range: "Touch",
      duration: "Instantaneous",
      description: "Heal shape.",
      effectKind: "heal",
      effectDiceCount: 1,
      effectDiceFaces: 8,
      upcastDicePerLevel: 1,
    },
    {
      id: "fixture-bonus-spell",
      name: "Fixture Healing Word",
      level: 1,
      school: "evocation",
      prepared: true,
      castingTime: "1 bonus action",
      range: "60 ft",
      duration: "Instantaneous",
      description: "Bonus-action cost coverage.",
      effectKind: "heal",
      effectDiceCount: 1,
      effectDiceFaces: 4,
      upcastDicePerLevel: 1,
    },
    {
      id: "fixture-reaction-spell",
      name: "Fixture Shield",
      level: 1,
      school: "abjuration",
      prepared: true,
      castingTime: "1 reaction, which you take when you are hit by an attack or targeted by magic missile",
      range: "Self",
      duration: "1 round",
      description: "Reaction cost coverage.",
    },
    {
      id: "fixture-ritual-spell",
      name: "Fixture Identify",
      level: 1,
      school: "divination",
      prepared: true,
      castingTime: "1 minute",
      range: "Touch",
      duration: "Instantaneous",
      description: "Ritual cost coverage — untracked by the turn economy.",
    },
  ],
};

async function createWizardWithSpells() {
  const id = "turn-resolution-wizard";
  await prisma.character.create({
    data: {
      ...BASE,
      id,
      name: "Turn Resolution Fixture (Wizard)",
      abilityScores: { strength: 8, dexterity: 12, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
      spellcasting: FIXTURE_SPELLCASTING as Prisma.InputJsonValue,
      classEntries: { create: [{ name: "wizard", classId: wizardClassId, position: 0 }] },
    },
  });
  return id;
}

// Mirrors the frontend's computeCastSpec (#1381).
function spellResolution(payload: Payload, spellName: string, costKind: "action" | "bonusAction" | "reaction"): TurnResolution {
  const casting = spellcastingOf(payload);
  const spell = spellNamed(payload, spellName);
  const roll = spell.effectRolls?.find((r) => r.slotLevel === spell.level);
  return {
    source: spell.name,
    cost: { kind: costKind },
    ...(spell.attackType === "attack" ? { toHit: { bonus: casting.spellAttackBonus, critRange: 20 } } : {}),
    ...(spell.attackType === "save" ? { save: { dc: casting.spellSaveDC, ability: spell.saveAbility! } } : {}),
    ...(roll
      ? { effect: { spec: roll.roll, kind: spell.effectKind as "damage" | "heal", damageType: spell.damageType ?? undefined } }
      : {}),
  };
}

describe("TurnResolution — spell shapes, entirely from served spellcasting/effectRolls fields", () => {
  it("attack-roll shape (Fire Bolt): toHit from spellAttackBonus, no save, damage from effectRolls", async () => {
    const payload = await serialize(await createWizardWithSpells());
    const resolution = spellResolution(payload, "Fixture Fire Bolt", "action");

    expect(resolution.toHit).toEqual({ bonus: 5, critRange: 20 });
    expect(resolution.save).toBeUndefined();
    expect(resolution.effect).toEqual({ spec: { count: 1, faces: 10, modifier: 0 }, kind: "damage", damageType: "fire" });
    expect(resolution.cost).toEqual({ kind: "action" });
  });

  it("saving-throw shape (Sacred Flame): save from spellSaveDC + the spell's own saveAbility, no toHit", async () => {
    const payload = await serialize(await createWizardWithSpells());
    const resolution = spellResolution(payload, "Fixture Sacred Flame", "action");

    expect(resolution.toHit).toBeUndefined();
    expect(resolution.save).toEqual({ dc: 13, ability: "dexterity" });
    expect(resolution.effect).toEqual({ spec: { count: 1, faces: 8, modifier: 0 }, kind: "damage", damageType: "radiant" });
  });

  it("auto-hit shape (Magic Missile): neither toHit nor save, damage from the combined effectRolls spec", async () => {
    const payload = await serialize(await createWizardWithSpells());
    const resolution = spellResolution(payload, "Fixture Magic Missile", "action");

    expect(resolution.toHit).toBeUndefined();
    expect(resolution.save).toBeUndefined();
    expect(resolution.effect).toEqual({ spec: { count: 3, faces: 4, modifier: 3 }, kind: "damage", damageType: "force" });
  });

  it("no-roll shape (Druidcraft): neither toHit, save, nor effect — a served empty effectRolls, not an omission", async () => {
    const payload = await serialize(await createWizardWithSpells());
    const spell = spellNamed(payload, "Fixture Druidcraft");
    expect(spell.effectRolls).toEqual([]);

    const resolution = spellResolution(payload, "Fixture Druidcraft", "action");
    expect(resolution.toHit).toBeUndefined();
    expect(resolution.save).toBeUndefined();
    expect(resolution.effect).toBeUndefined();
  });

  it("heal shape (Cure Wounds): neither toHit nor save, effect.kind is heal with no damageType", async () => {
    const payload = await serialize(await createWizardWithSpells());
    const resolution = spellResolution(payload, "Fixture Cure Wounds", "action");

    expect(resolution.toHit).toBeUndefined();
    expect(resolution.save).toBeUndefined();
    // Heal ability modifier is baked into the served roll's modifier (#1381).
    expect(resolution.effect).toEqual({ spec: { count: 1, faces: 8, modifier: 3 }, kind: "heal", damageType: undefined });
  });

  it("serves a normalized castCost per spell, never requiring a client-side castingTime parse", async () => {
    const payload = await serialize(await createWizardWithSpells());
    expect(spellNamed(payload, "Fixture Fire Bolt").castCost).toBe("action");
    expect(spellNamed(payload, "Fixture Healing Word").castCost).toBe("bonusAction");
    expect(spellNamed(payload, "Fixture Shield").castCost).toBe("reaction");
    expect(spellNamed(payload, "Fixture Identify").castCost).toBe("other");
  });
});
