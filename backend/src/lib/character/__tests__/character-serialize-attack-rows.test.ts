// Served attack rows (#1434): serializeCharacter emits one row per way the
// character can swing, with the numbers already resolved — including the
// Two-Weapon Fighting off-hand row, whose ability-modifier subtraction used to
// happen on the client. Composed from the already-serialized inventory, so a row
// can never disagree with the `inventory[].weapon` values rendered beside it.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";

const OWNER_ID = "owner-serialize-attack-rows";

const BASE = {
  ownerId: OWNER_ID,
  alignment: "Neutral",
  experiencePoints: 0, // level 1, proficiency +2
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

/** Two-Weapon Fighting fighting style, as the advancement entry #1137 stores. */
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
  requiresAttunement?: boolean;
  attuned?: boolean;
  riderDice?: { count: number; faces: number; damageType?: string };
};

const createdIds: string[] = [];
// #1529: weapon/armor proficiency AND the Fighting Style feat slot cap both
// resolve via the class FK relation now — this fixture must link classId to
// the real seeded Fighter row, or (a) the Longsword proficiency bonus goes
// missing and (b) TWF_STYLE's advancement gets clamped out as over-cap
// (fightingStyleSlotTotal 0 for a homebrew entry).
let fighterClassId: string;

/** The while-active Rage buff, present only when a bonus is requested. */
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

/** One weapon fixture's InventoryItem create data, position-ordered. */
function weaponItemData(characterId: string, position: number, w: WeaponFixture) {
  return inventoryItemFixtureData({
    characterId,
    name: w.name,
    category: "weapon",
    position,
    equippedSlot: w.equippedSlot ?? "MAIN_HAND",
    requiresAttunement: w.requiresAttunement ?? false,
    attuned: w.attuned ?? false,
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: w.damageDiceFaces ?? 8,
      damageModifier: 0,
      damageType: w.damageType ?? "slashing",
      finesse: w.finesse ?? false,
      ...(w.versatile ? { versatileDiceCount: 1, versatileDiceFaces: 10 } : {}),
      weaponClass: "martial",
      weaponRange: "melee",
    },
    capabilities: w.riderDice
      ? [
          {
            kind: "passiveBonus",
            target: "damage",
            op: "add",
            valueDiceCount: w.riderDice.count,
            valueDiceFaces: w.riderDice.faces,
            valueDamageType: w.riderDice.damageType,
          },
        ]
      : [],
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
    // Absolute numbers, so an upstream regression in the attack/damage
    // derivations is caught here and not just latched against itself.
    expect(row.attackSpec).toEqual({ count: 1, faces: 20, modifier: 5 });
    expect(row.damageSpec).toEqual({ count: 1, faces: 8, modifier: 3 });
    expect(row.damageType).toBe("slashing");
    expect(row.grip).toBe("one-handed");
    expect(row.offHand).toBe(false);
    expect(row.magical).toBe(false);
    expect(row.damageRiders).toEqual([]);

    // …and the latch that the row is COMPOSED from the served item, not re-derived.
    const item = payload.inventory.find((i) => i.id === row.id)!;
    expect(row.attackSpec.modifier).toBe(item.weapon!.attackBonus);
    expect(row.damageSpec).toEqual({
      count: item.weapon!.damage.damageDiceCount,
      faces: item.weapon!.damage.damageDiceFaces,
      modifier: item.weapon!.damage.damageModifier,
    });
    expect(row.attackComponents).toEqual(item.weapon!.attackBonusComponents);
    expect(row.damageComponents).toEqual({ abilityMod: 3, meleeDamageBonus: 0 });
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

  // The off-hand row's subtraction is against ITS OWN weapon's served ability
  // modifier — not against the main-hand row's modifier. A STR Longsword (+3)
  // beside a finesse Dagger that picks DEX 18 (+4) is where the two answers
  // differ, and the main-hand-relative reading would emit −1.
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
    expect(mainHand.damageSpec.modifier).toBe(3); // STR +3
    expect(dagger.weapon!.damage.abilityModifier).toBe(4); // finesse → max(STR +3, DEX +4)

    const offHand = offHandRow(payload)!;
    expect(offHand.damageSpec.modifier).toBe(
      dagger.weapon!.damage.damageModifier - Math.max(0, dagger.weapon!.damage.abilityModifier),
    );
    expect(offHand.damageSpec.modifier).toBe(0);
    expect(offHand.damageSpec.modifier).not.toBe(mainHand.damageSpec.modifier - 4);
  });

  it("keeps the ability modifier with the Two-Weapon Fighting style, matching the main hand", async () => {
    // Same-ability pair (two finesse Shortswords) so "equals the main-hand row's
    // modifier" is a meaningful assertion rather than a coincidence.
    const pair: WeaponFixture[] = [
      { name: "Shortsword", equippedSlot: "MAIN_HAND", damageDiceFaces: 6, damageType: "piercing", finesse: true },
      { name: "Shortsword", equippedSlot: "OFF_HAND", damageDiceFaces: 6, damageType: "piercing", finesse: true },
    ];

    const withStyle = await serialize(await createFighter(pair, { resources: TWF_STYLE }));
    expect(offHandRow(withStyle)!.damageSpec.modifier).toBe(
      weaponRows(withStyle)[0].damageSpec.modifier,
    );
    expect(offHandRow(withStyle)!.damageSpec.modifier).toBe(3);
    expect(offHandRow(withStyle)!.damageComponents).toEqual({ abilityMod: 3, meleeDamageBonus: 0 });

    const withoutStyle = await serialize(await createFighter(pair));
    expect(offHandRow(withoutStyle)!.damageSpec.modifier).toBe(0);
    expect(offHandRow(withoutStyle)!.damageComponents).toEqual({ abilityMod: 0, meleeDamageBonus: 0 });
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
    expect(offHandRow(payload)!.damageComponents).toEqual({ abilityMod: -1, meleeDamageBonus: 0 });
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

    expect(weaponRows(payload)[0].damageSpec.modifier).toBe(5); // STR +3 + Rage +2
    const offHand = offHandRow(payload)!;
    expect(offHand.damageSpec.modifier).toBe(2);
    expect(offHand.damageComponents).toEqual({ abilityMod: 0, meleeDamageBonus: 2 });
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
