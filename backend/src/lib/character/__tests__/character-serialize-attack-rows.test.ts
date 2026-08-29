import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";
import type { WeaponDetailInput } from "@/lib/inventory/item-detail-inputs.js";

const OWNER_ID = "owner-serialize-attack-rows";

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
  hitDice: { total: 1, die: "d10", spent: 0 },
};

const SCORES = { strength: 16, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 };

const TWF_STYLE = {
  advancements: [
    {
      id: "fs-twf",
      level: 1,
      kind: "feat",
      slot: "fightingStyle",
      abilityDeltas: {},
      hpDelta: 0,
      initDelta: 0,
      featName: "Two-Weapon Fighting",
      improvements: [{ target: "offhandAbilityDamage", amount: 1 }],
    },
  ],
};

type WeaponFixture = {
  name: string;
  equippedSlot?: "MAIN_HAND" | "OFF_HAND";
  damageDiceFaces?: number;
  damageType?: string;
  finesse?: boolean;
  versatile?: boolean;
  light?: boolean;
  requiresAttunement?: boolean;
  attuned?: boolean;
  riderDice?: { count: number; faces: number; damageType?: string };
};

const createdIds: string[] = [];
// classId must link to the real seeded Fighter row, or the Longsword proficiency bonus goes missing and TWF_STYLE's advancement gets clamped out as over-cap (#1529).
let fighterClassId: string;

function meleeDamageBuffData(modifier: number | undefined) {
  if (!modifier) return {};
  return {
    activeEffects: {
      buffs: [
        { id: "buff-rage", key: "rage", target: "meleeDamage", modifier, source: "Rage", duration: "while-active" },
      ],
    },
  };
}

function weaponDetailFixture(w: WeaponFixture): WeaponDetailInput {
  return {
    damageDiceCount: 1,
    damageDiceFaces: w.damageDiceFaces ?? 8,
    damageModifier: 0,
    damageType: w.damageType ?? "slashing",
    finesse: w.finesse ?? false,
    light: w.light ?? false,
    ...(w.versatile ? { versatileDiceCount: 1, versatileDiceFaces: 10 } : {}),
    weaponClass: "martial",
    weaponRange: "melee",
  };
}

function riderCapabilities(riderDice: WeaponFixture["riderDice"]) {
  if (!riderDice) return [];
  return [
    {
      kind: "passiveBonus",
      target: "damage",
      op: "add",
      valueDiceCount: riderDice.count,
      valueDiceFaces: riderDice.faces,
      valueDamageType: riderDice.damageType,
    },
  ];
}

function weaponItemData(characterId: string, position: number, w: WeaponFixture) {
  return inventoryItemFixtureData({
    characterId,
    name: w.name,
    category: "weapon",
    position,
    equippedSlot: w.equippedSlot ?? "MAIN_HAND",
    requiresAttunement: w.requiresAttunement ?? false,
    attuned: w.attuned ?? false,
    weapon: weaponDetailFixture(w),
    capabilities: riderCapabilities(w.riderDice),
  });
}

async function createFighter(
  weapons: WeaponFixture[],
  extra: { abilityScores?: Record<string, number>; resources?: unknown; meleeDamageBuff?: number } = {},
) {
  const character = await prisma.character.create({
    data: {
      ...BASE,
      name: "Attack Rows Fixture",
      abilityScores: extra.abilityScores ?? SCORES,
      ...(extra.resources ? { resources: extra.resources as object } : {}),
      ...meleeDamageBuffData(extra.meleeDamageBuff),
      classEntries: { create: [{ name: "Fighter", classId: fighterClassId, position: 0, level: 1 }] },
    },
  });
  createdIds.push(character.id);

  for (const [position, w] of weapons.entries()) {
    await prisma.inventoryItem.create({ data: weaponItemData(character.id, position, w) });
  }

  return character.id;
}

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

type Payload = Awaited<ReturnType<typeof serialize>>;

function weaponRows(payload: Payload) {
  return payload.attackRows.filter((r) => r.kind === "weapon" && !r.offHand);
}

function offHandRow(payload: Payload) {
  return payload.attackRows.find((r) => r.offHand);
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" }, select: { id: true } })).id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: createdIds } } });
  createdIds.length = 0;
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { ownerId: OWNER_ID } });
});

describe("serializeCharacter attackRows — equipped weapons", () => {
  it("serves a Longsword row whose numbers are the inventory row's own (STR 16, prof +2)", async () => {
    const id = await createFighter([{ name: "Longsword" }]);
    const payload = await serialize(id);

    const [row] = weaponRows(payload);
    expect(row.kind).toBe("weapon");
    expect(row.name).toBe("Longsword");
    // Absolute numbers so an upstream regression in the derivations is caught here, not just latched against itself.
    expect(row.attackSpec).toEqual({ count: 1, faces: 20, modifier: 5 });
    expect(row.damageSpec).toEqual({ count: 1, faces: 8, modifier: 3 });
    expect(row.damageType).toBe("slashing");
    expect(row.grip).toBe("one-handed");
    expect(row.offHand).toBe(false);
    expect(row.magical).toBe(false);
    expect(row.damageRiders).toEqual([]);

    // Latches that the row is composed from the served item, not re-derived.
    const item = payload.inventory.find((i) => i.id === row.id)!;
    expect(row.attackSpec.modifier).toBe(item.weapon!.attackBonus);
    expect(row.damageSpec).toEqual({
      count: item.weapon!.damage.damageDiceCount,
      faces: item.weapon!.damage.damageDiceFaces,
      modifier: item.weapon!.damage.damageModifier,
    });
    expect(row.attackComponents).toEqual(item.weapon!.attackBonusComponents);
    expect(row.damageComponents).toEqual({ abilityMod: 3, meleeDamageBonus: 0, ability: "strength" });
  });

  it("emits equipped weapons in inventory order, then the off-hand row, then unarmed, then improvised", async () => {
    const id = await createFighter([
      { name: "Longsword", equippedSlot: "MAIN_HAND" },
      { name: "Dagger", equippedSlot: "OFF_HAND", damageDiceFaces: 4, damageType: "piercing" },
    ]);
    const payload = await serialize(id);

    expect(payload.attackRows.map((r) => ({ name: r.name, offHand: r.offHand }))).toEqual([
      { name: "Longsword", offHand: false },
      { name: "Dagger", offHand: false },
      { name: "Dagger", offHand: true },
      { name: "Unarmed Strike", offHand: false },
      { name: "Improvised Weapon", offHand: false },
    ]);
  });

  it("emits one row per equipped weapon, un-deduped — the same-name collapse stays a client concern", async () => {
    const id = await createFighter([
      { name: "Dagger", equippedSlot: "MAIN_HAND", damageDiceFaces: 4, damageType: "piercing" },
      { name: "Dagger", equippedSlot: "OFF_HAND", damageDiceFaces: 4, damageType: "piercing" },
    ]);
    const payload = await serialize(id);

    const rows = weaponRows(payload);
    expect(rows.map((r) => r.name)).toEqual(["Dagger", "Dagger"]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it("skips an unequipped weapon", async () => {
    const id = await createFighter([{ name: "Longsword" }]);
    await prisma.inventoryItem.updateMany({ where: { characterId: id }, data: { equippedSlot: null } });
    const payload = await serialize(id);
    expect(weaponRows(payload)).toEqual([]);
    expect(payload.attackRows.map((r) => r.kind)).toEqual(["unarmed", "improvised"]);
  });
});

describe("serializeCharacter attackRows — off-hand row (Two-Weapon Fighting)", () => {
  it("emits no off-hand row with a single equipped weapon", async () => {
    const id = await createFighter([{ name: "Longsword" }]);
    expect(offHandRow(await serialize(id))).toBeUndefined();
  });

  it("shares the off-hand weapon's own id, so a persisted tally formId still resolves", async () => {
    const id = await createFighter([
      { name: "Longsword", equippedSlot: "MAIN_HAND" },
      { name: "Dagger", equippedSlot: "OFF_HAND", damageDiceFaces: 4, damageType: "piercing" },
    ]);
    const payload = await serialize(id);

    const dagger = payload.inventory.find((i) => i.name === "Dagger")!;
    expect(offHandRow(payload)!.id).toBe(dagger.id);
  });

  it("prefers the OFF_HAND slot over inventory order", async () => {
    const id = await createFighter([
      { name: "Dagger", equippedSlot: "OFF_HAND", damageDiceFaces: 4, damageType: "piercing" },
      { name: "Longsword", equippedSlot: "MAIN_HAND" },
    ]);
    expect(offHandRow(await serialize(id))!.name).toBe("Dagger");
  });

  // The off-hand row subtracts ITS OWN weapon's ability modifier, not the main hand's — a STR Longsword (+3) beside a DEX 18 finesse Dagger (+4) is where a main-hand-relative reading would wrongly emit −1.
  it("drops the OFF-HAND weapon's own ability modifier, not the main hand's", async () => {
    const id = await createFighter(
      [
        { name: "Longsword", equippedSlot: "MAIN_HAND" },
        { name: "Dagger", equippedSlot: "OFF_HAND", damageDiceFaces: 4, damageType: "piercing", finesse: true },
      ],
      { abilityScores: { ...SCORES, dexterity: 18 } },
    );
    const payload = await serialize(id);

    const mainHand = weaponRows(payload).find((r) => r.name === "Longsword")!;
    const dagger = payload.inventory.find((i) => i.name === "Dagger")!;
    expect(mainHand.damageSpec.modifier).toBe(3);
    expect(dagger.weapon!.damage.abilityModifier).toBe(4);

    const offHand = offHandRow(payload)!;
    expect(offHand.damageSpec.modifier).toBe(
      dagger.weapon!.damage.damageModifier - Math.max(0, dagger.weapon!.damage.abilityModifier),
    );
    expect(offHand.damageSpec.modifier).toBe(0);
    expect(offHand.damageSpec.modifier).not.toBe(mainHand.damageSpec.modifier - 4);
  });

  it("keeps the ability modifier with the Two-Weapon Fighting style AND a light pair, matching the main hand", async () => {
    // Same-ability pair so "equals the main-hand row's modifier" is meaningful, not a coincidence.
    const pair: WeaponFixture[] = [
      { name: "Shortsword", equippedSlot: "MAIN_HAND", damageDiceFaces: 6, damageType: "piercing", finesse: true, light: true },
      { name: "Shortsword", equippedSlot: "OFF_HAND", damageDiceFaces: 6, damageType: "piercing", finesse: true, light: true },
    ];

    const withStyle = await serialize(await createFighter(pair, { resources: TWF_STYLE }));
    expect(offHandRow(withStyle)!.damageSpec.modifier).toBe(
      weaponRows(withStyle)[0].damageSpec.modifier,
    );
    expect(offHandRow(withStyle)!.damageSpec.modifier).toBe(3);
    expect(offHandRow(withStyle)!.damageComponents).toEqual({ abilityMod: 3, meleeDamageBonus: 0, ability: "strength" });

    const withoutStyle = await serialize(await createFighter(pair));
    expect(offHandRow(withoutStyle)!.damageSpec.modifier).toBe(0);
    expect(offHandRow(withoutStyle)!.damageComponents).toEqual({ abilityMod: 0, meleeDamageBonus: 0, ability: "strength" });
  });

  // PHB'14 p. 195 + p. 72 / SRD 5.2: both editions require a light weapon in each hand (#1496).
  it("drops the ability modifier with the Two-Weapon Fighting style but a NON-light pair (#1640)", async () => {
    const nonLightPair: WeaponFixture[] = [
      { name: "Longsword", equippedSlot: "MAIN_HAND", damageDiceFaces: 8, damageType: "slashing", light: false },
      { name: "Longsword", equippedSlot: "OFF_HAND", damageDiceFaces: 8, damageType: "slashing", light: false },
    ];

    const withStyle = await serialize(await createFighter(nonLightPair, { resources: TWF_STYLE }));
    expect(offHandRow(withStyle)!.damageSpec.modifier).toBe(0);
    expect(offHandRow(withStyle)!.damageComponents).toEqual({ abilityMod: 0, meleeDamageBonus: 0, ability: "strength" });
  });

  it("serves offHandAttack disabled for a non-Light pair even WITH the Two-Weapon Fighting style, but enabled for a Light pair (#1435/#1496)", async () => {
    const nonLightPair: WeaponFixture[] = [
      { name: "Longsword", equippedSlot: "MAIN_HAND", damageDiceFaces: 8, damageType: "slashing", light: false },
      { name: "Longsword", equippedSlot: "OFF_HAND", damageDiceFaces: 8, damageType: "slashing", light: false },
    ];
    const lightPair: WeaponFixture[] = [
      { name: "Shortsword", equippedSlot: "MAIN_HAND", damageDiceFaces: 6, damageType: "piercing", finesse: true, light: true },
      { name: "Shortsword", equippedSlot: "OFF_HAND", damageDiceFaces: 6, damageType: "piercing", finesse: true, light: true },
    ];

    const nonLight = await serialize(await createFighter(nonLightPair, { resources: TWF_STYLE }));
    const nonLightRow = nonLight.availableActions.find((a) => a.key === "offHandAttack");
    expect(nonLightRow?.enabled).toBe(false);
    expect(nonLightRow?.disabledReason).toMatch(/Light weapons/);

    const light = await serialize(await createFighter(lightPair, { resources: TWF_STYLE }));
    expect(light.availableActions.find((a) => a.key === "offHandAttack")?.enabled).toBe(true);
  });

  it("keeps a negative ability modifier without the style — only a positive one is dropped", async () => {
    const id = await createFighter(
      [
        { name: "Club", equippedSlot: "MAIN_HAND", damageDiceFaces: 4, damageType: "bludgeoning" },
        { name: "Club", equippedSlot: "OFF_HAND", damageDiceFaces: 4, damageType: "bludgeoning" },
      ],
      { abilityScores: { ...SCORES, strength: 8 } },
    );
    const payload = await serialize(id);
    expect(offHandRow(payload)!.damageSpec.modifier).toBe(-1);
    expect(offHandRow(payload)!.damageComponents).toEqual({ abilityMod: -1, meleeDamageBonus: 0, ability: "strength" });
  });

  it("keeps a melee-damage buff (Rage) while dropping only the ability component, so the components still sum", async () => {
    const id = await createFighter(
      [
        { name: "Shortsword", equippedSlot: "MAIN_HAND", damageDiceFaces: 6, damageType: "piercing" },
        { name: "Shortsword", equippedSlot: "OFF_HAND", damageDiceFaces: 6, damageType: "piercing" },
      ],
      { meleeDamageBuff: 2 },
    );
    const payload = await serialize(id);

    expect(weaponRows(payload)[0].damageSpec.modifier).toBe(5);
    const offHand = offHandRow(payload)!;
    expect(offHand.damageSpec.modifier).toBe(2);
    expect(offHand.damageComponents).toEqual({ abilityMod: 0, meleeDamageBonus: 2, ability: "strength" });
    expect(offHand.damageComponents!.abilityMod + offHand.damageComponents!.meleeDamageBonus).toBe(
      offHand.damageSpec.modifier,
    );
  });
});

describe("serializeCharacter attackRows — damage riders", () => {
  const flameTongue: WeaponFixture = {
    name: "Flame Tongue",
    requiresAttunement: true,
    riderDice: { count: 2, faces: 6, damageType: "fire" },
  };

  it("contributes no riders while an attunement-required weapon is equipped but unattuned", async () => {
    const id = await createFighter([{ ...flameTongue, attuned: false }]);
    const payload = await serialize(id);
    expect(weaponRows(payload)[0].damageRiders).toEqual([]);
  });

  it("adds the +2d6 fire rider once the weapon is attuned", async () => {
    const id = await createFighter([{ ...flameTongue, attuned: true }]);
    const payload = await serialize(id);

    const row = weaponRows(payload)[0];
    expect(row.damageRiders).toEqual([
      { id: `${row.id}:rider:0`, spec: { count: 2, faces: 6, modifier: 0 }, damageType: "fire" },
    ]);
  });

  it("scopes riders to their own weapon — another item's capability never leaks in", async () => {
    const id = await createFighter([
      { ...flameTongue, attuned: true, equippedSlot: "MAIN_HAND" },
      { name: "Dagger", equippedSlot: "OFF_HAND", damageDiceFaces: 4, damageType: "piercing" },
    ]);
    const payload = await serialize(id);

    const rows = weaponRows(payload);
    expect(rows.find((r) => r.name === "Flame Tongue")!.damageRiders).toHaveLength(1);
    expect(rows.find((r) => r.name === "Dagger")!.damageRiders).toEqual([]);
  });
});

describe("serializeCharacter attackRows — unarmed and improvised", () => {
  it("restates the served unarmedStrike/improvisedWeapon rather than re-deriving them", async () => {
    const id = await createFighter([]);
    const payload = await serialize(id);

    const unarmed = payload.attackRows.find((r) => r.kind === "unarmed")!;
    expect(unarmed.id).toBe("unarmed");
    expect(unarmed.name).toBe("Unarmed Strike");
    expect(unarmed.attackSpec).toEqual({ count: 1, faces: 20, modifier: payload.unarmedStrike.attackBonus });
    expect(unarmed.damageSpec).toEqual({
      count: payload.unarmedStrike.damage.count,
      faces: payload.unarmedStrike.damage.faces,
      modifier: payload.unarmedStrike.damage.modifier,
    });
    expect(unarmed.damageType).toBe("bludgeoning");
    expect(unarmed.magical).toBe(payload.unarmedStrike.magical);
    expect(unarmed.grip).toBeUndefined();
    expect(unarmed.attackComponents).toBeUndefined();
    expect(unarmed.damageComponents).toBeUndefined();

    const improvised = payload.attackRows.find((r) => r.kind === "improvised")!;
    expect(improvised.id).toBe("improvised");
    expect(improvised.name).toBe("Improvised Weapon");
    expect(improvised.attackSpec).toEqual({ count: 1, faces: 20, modifier: payload.improvisedWeapon.attackBonus });
    expect(improvised.damageSpec).toEqual({ count: 1, faces: 4, modifier: 3 });
    expect(improvised.magical).toBe(false);
    expect(improvised.damageRiders).toEqual([]);
  });
});
