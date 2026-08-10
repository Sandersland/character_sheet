/**
 * Fighting Style feats (#1137) — end-to-end derivation. A level-5 Fighter takes
 * a Fighting Style feat via the advancement endpoint's fightingStyle slot, and
 * its mechanical effect is derived at read time exactly as the former scalar
 * styles were: Archery +2 to ranged attack rolls only, Defense +1 AC while
 * wearing body armor only.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";

const OWNER_ID = "owner-fs-feats";
let COOKIE: string;
const FIXTURE_ID = "test-fs-feats-1";
const L5_XP = 6500;

let archeryFeatId: string;
let defenseFeatId: string;
let fighterClassId: string;

const advUrl = `/api/characters/${FIXTURE_ID}/advancement/transactions`;
const invUrl = `/api/characters/${FIXTURE_ID}/inventory/transactions`;
const get = () => supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
const takeStyle = (featId: string) =>
  supertest.agent(app).set("Cookie", COOKIE).post(advUrl).send({
    operations: [{ type: "takeFeat", featId, slot: "fightingStyle" }],
  });
const acquire = (custom: unknown) =>
  supertest.agent(app).set("Cookie", COOKIE).post(invUrl).send({ operations: [{ type: "acquire", custom, equipped: true }] });

function findWeapon(body: { inventory: Array<{ name: string; weapon?: { attackBonus: number } }> }, name: string) {
  return body.inventory.find((i) => i.name === name)?.weapon;
}

const leather = { name: "Test Leather", category: "armor", armor: { armorCategory: "light", baseArmorClass: 11 } };

beforeAll(async () => {
  const archery = await upsertEditionRow(
    prisma.feat,
    { name: "Archery (FS Feat Test)", edition: null },
    {
      name: "Archery (FS Feat Test)", description: "+2 ranged attack.", category: "fighting_style",
      prerequisite: "Fighting Style feature",
      improvements: [{ target: "rangedAttackRoll", amount: 2 }] as unknown as Prisma.InputJsonValue,
    },
    { category: "fighting_style", improvements: [{ target: "rangedAttackRoll", amount: 2 }] as unknown as Prisma.InputJsonValue },
  );
  archeryFeatId = archery.id;
  const defense = await upsertEditionRow(
    prisma.feat,
    { name: "Defense (FS Feat Test)", edition: null },
    {
      name: "Defense (FS Feat Test)", description: "+1 AC while armored.", category: "fighting_style",
      prerequisite: "Fighting Style feature",
      improvements: [{ target: "armorClassWhileArmored", amount: 1 }] as unknown as Prisma.InputJsonValue,
    },
    { category: "fighting_style", improvements: [{ target: "armorClassWhileArmored", amount: 1 }] as unknown as Prisma.InputJsonValue },
  );
  defenseFeatId = defense.id;
  // #1529: the fs-slot cap resolves via CharacterClass.fightingStyleFeatLevel
  // through the class FK relation now — the fixture below must link classId
  // to the real seeded Fighter row, or takeStyle's fs feat gets clamped out.
  fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" }, select: { id: true } })).id;
});

afterAll(async () => {
  await prisma.feat.deleteMany({ where: { name: { in: ["Archery (FS Feat Test)", "Defense (FS Feat Test)"] } } });
});

beforeEach(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  await prisma.character.create({
    data: {
      id: FIXTURE_ID, name: "FS Feats Fixture", alignment: "True Neutral",
      ownerId: OWNER_ID, experiencePoints: L5_XP, initiativeBonus: 3, speed: 30,
      hitPoints: { current: 44, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 5, die: "d10", spent: 0 },
      abilityScores: { strength: 16, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: [], skills: [], toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      spellcasting: Prisma.JsonNull,
      classEntries: { create: [{ position: 0, name: "Fighter", classId: fighterClassId, level: 5 }] },
    },
  });
  // #1649: weapon detail now lives on InventoryItem.snapshot, so these are
  // created separately rather than nested under character.create.
  await prisma.inventoryItem.create({
    data: inventoryItemFixtureData({
      characterId: FIXTURE_ID, name: "Longbow", category: "weapon", equippedSlot: "MAIN_HAND",
      weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "piercing", weaponRange: "ranged", twoHanded: true },
    }),
  });
  await prisma.inventoryItem.create({
    data: inventoryItemFixtureData({
      characterId: FIXTURE_ID, name: "Longsword", category: "weapon",
      weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing", weaponRange: "melee" },
    }),
  });
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

describe("Archery Fighting Style feat", () => {
  it("adds +2 to ranged attack rolls only, leaving melee unchanged", async () => {
    const before = (await get()).body;
    const baseRanged = findWeapon(before, "Longbow")!.attackBonus;
    const baseMelee = findWeapon(before, "Longsword")!.attackBonus;

    const res = await takeStyle(archeryFeatId);
    expect(res.status).toBe(200);
    const after = (await get()).body;
    expect(findWeapon(after, "Longbow")!.attackBonus).toBe(baseRanged + 2);
    expect(findWeapon(after, "Longsword")!.attackBonus).toBe(baseMelee);
  });
});

describe("Defense Fighting Style feat", () => {
  it("adds +1 AC while wearing body armor", async () => {
    await acquire(leather);
    const before = (await get()).body;
    const res = await takeStyle(defenseFeatId);
    expect(res.status).toBe(200);
    const after = (await get()).body;
    expect(after.armorClass).toBe(before.armorClass + 1);
  });

  it("adds no AC while unarmored", async () => {
    const before = (await get()).body;
    await takeStyle(defenseFeatId);
    const after = (await get()).body;
    expect(after.armorClass).toBe(before.armorClass);
  });
});

/**
 * PHB'14 per-class Fighting Style subset (#1495) — hard enforcement at the
 * write path, not just the picker: resolveCatalogFeat rejects a fightingStyle
 * takeFeat op for a style the character's class(es) don't offer, even if the
 * caller bypasses the GET /api/feats?classes= filter entirely. Runs against
 * the REAL SEEDED 2014 catalog (backend/prisma/seed/feats.ts), a second
 * fixture character (a Ranger) alongside this file's Fighter fixture above.
 */
describe("Fighting Style class gate — write path (#1495)", () => {
  const RANGER_OWNER_ID = "owner-fs-feats-ranger";
  const RANGER_FIXTURE_ID = "test-fs-feats-ranger";
  let rangerCookie: string;
  let rangerClassId: string;
  let greatWeaponFighting2014Id: string;
  let archery2014Id: string;

  const rangerAdvUrl = `/api/characters/${RANGER_FIXTURE_ID}/advancement/transactions`;
  const takeRangerStyle = (featId: string) =>
    supertest.agent(app).set("Cookie", rangerCookie).post(rangerAdvUrl).send({
      operations: [{ type: "takeFeat", featId, slot: "fightingStyle" }],
    });

  beforeAll(async () => {
    rangerClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Ranger" }, select: { id: true } })).id;
    greatWeaponFighting2014Id = (
      await prisma.feat.findFirstOrThrow({ where: { name: "Great Weapon Fighting", edition: "EDITION_2014" }, select: { id: true } })
    ).id;
    archery2014Id = (
      await prisma.feat.findFirstOrThrow({ where: { name: "Archery", edition: "EDITION_2014" }, select: { id: true } })
    ).id;
  });

  beforeEach(async () => {
    await ensureTestOwner(RANGER_OWNER_ID);
    rangerCookie = await authCookie(RANGER_OWNER_ID);
    await prisma.character.create({
      data: {
        id: RANGER_FIXTURE_ID, name: "FS Class Gate Fixture", alignment: "True Neutral",
        ownerId: RANGER_OWNER_ID, experiencePoints: L5_XP, initiativeBonus: 3, speed: 30,
        rulesEdition: "EDITION_2014",
        hitPoints: { current: 44, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 5, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: [], skills: [], toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ position: 0, name: "Ranger", classId: rangerClassId, level: 5 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: RANGER_FIXTURE_ID } });
  });

  it("rejects Great Weapon Fighting (Fighter/Paladin-only) for a 2014 Ranger", async () => {
    const res = await takeRangerStyle(greatWeaponFighting2014Id);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not an offered Fighting Style/);
  });

  it("accepts Archery (in the Ranger subset) for a 2014 Ranger", async () => {
    const res = await takeRangerStyle(archery2014Id);
    expect(res.status).toBe(200);
  });

  // #1495 review finding: the entry's OWN `name` column is a free-to-diverge
  // display name (CharacterClassEntry.name), not the catalog's canonical
  // class name — the gate must read `class.name` through the classId FK, or
  // a renamed entry's offered set silently empties (nothing in Feat.classes
  // matches an arbitrary display string).
  it("gates on the CANONICAL class name via classId, not the entry's own (possibly renamed) display name", async () => {
    await prisma.character.update({
      where: { id: RANGER_FIXTURE_ID },
      data: { classEntries: { updateMany: { where: {}, data: { name: "Renamed Ranger Entry" } } } },
    });

    const archeryRes = await takeRangerStyle(archery2014Id);
    expect(archeryRes.status).toBe(200);
  });
});

/**
 * #1495 review finding: fightingStyleClassNames must only include a class
 * once its OWN entry has reached that class's fightingStyleFeatLevel — not
 * merely because the class has one at all. A Paladin2/Ranger1 multiclass has
 * earned Paladin's Fighting Style (grant L2) but not Ranger's (grant L2,
 * entry only at L1), so the offered union must be Paladin's subset alone.
 */
describe("Fighting Style class gate — multiclass level threshold (#1495)", () => {
  const MC_OWNER_ID = "owner-fs-feats-mc";
  const MC_FIXTURE_ID = "test-fs-feats-mc";
  let mcCookie: string;
  let paladinClassId: string;
  let mcRangerClassId: string;
  let archery2014Id: string;
  let greatWeaponFighting2014Id: string;

  const mcAdvUrl = `/api/characters/${MC_FIXTURE_ID}/advancement/transactions`;
  const takeMcStyle = (featId: string) =>
    supertest.agent(app).set("Cookie", mcCookie).post(mcAdvUrl).send({
      operations: [{ type: "takeFeat", featId, slot: "fightingStyle" }],
    });

  beforeAll(async () => {
    paladinClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Paladin" }, select: { id: true } })).id;
    mcRangerClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Ranger" }, select: { id: true } })).id;
    archery2014Id = (
      await prisma.feat.findFirstOrThrow({ where: { name: "Archery", edition: "EDITION_2014" }, select: { id: true } })
    ).id;
    greatWeaponFighting2014Id = (
      await prisma.feat.findFirstOrThrow({ where: { name: "Great Weapon Fighting", edition: "EDITION_2014" }, select: { id: true } })
    ).id;
  });

  beforeEach(async () => {
    await ensureTestOwner(MC_OWNER_ID);
    mcCookie = await authCookie(MC_OWNER_ID);
    // Paladin 2 / Ranger 1 = total level 3: Paladin's own entry has reached
    // its L2 Fighting Style grant; Ranger's own entry (L1) has not reached
    // its L2 grant yet.
    await prisma.character.create({
      data: {
        id: MC_FIXTURE_ID, name: "FS Multiclass Threshold Fixture", alignment: "True Neutral",
        ownerId: MC_OWNER_ID, experiencePoints: 900, initiativeBonus: 2, speed: 30,
        rulesEdition: "EDITION_2014",
        hitPoints: { current: 20, max: 20, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d10", spent: 0 },
        abilityScores: { strength: 14, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 12, charisma: 14 },
        savingThrowProficiencies: [], skills: [], toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [
            { position: 0, name: "Paladin", classId: paladinClassId, level: 2 },
            { position: 1, name: "Ranger", classId: mcRangerClassId, level: 1 },
          ],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: MC_FIXTURE_ID } });
  });

  it("rejects Archery — Ranger offers it, but the Ranger entry hasn't earned Fighting Style yet", async () => {
    const res = await takeMcStyle(archery2014Id);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not an offered Fighting Style/);
  });

  it("accepts Great Weapon Fighting — Paladin offers it and HAS earned Fighting Style", async () => {
    const res = await takeMcStyle(greatWeaponFighting2014Id);
    expect(res.status).toBe(200);
  });
});

/**
 * #1495 review finding: a custom (homebrew) feat placed in the fightingStyle
 * slot whose NAME matches one of the catalog's own Fighting Style names is a
 * pick of that style through the custom channel, not genuine homebrew — the
 * class gate must apply identically, or a player could route around "hard
 * enforcement" by retyping a rejected catalog row as `custom`.
 */
describe("Fighting Style class gate — custom feat in the fightingStyle slot (#1495)", () => {
  const CUSTOM_OWNER_ID = "owner-fs-feats-custom";
  const CUSTOM_FIXTURE_ID = "test-fs-feats-custom";
  let customCookie: string;
  let customRangerClassId: string;

  const customAdvUrl = `/api/characters/${CUSTOM_FIXTURE_ID}/advancement/transactions`;
  const takeCustomStyle = (custom: { name: string; description?: string }) =>
    supertest.agent(app).set("Cookie", customCookie).post(customAdvUrl).send({
      operations: [{ type: "takeFeat", custom, slot: "fightingStyle" }],
    });

  beforeAll(async () => {
    customRangerClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Ranger" }, select: { id: true } })).id;
  });

  beforeEach(async () => {
    await ensureTestOwner(CUSTOM_OWNER_ID);
    customCookie = await authCookie(CUSTOM_OWNER_ID);
    await prisma.character.create({
      data: {
        id: CUSTOM_FIXTURE_ID, name: "FS Custom Feat Gate Fixture", alignment: "True Neutral",
        ownerId: CUSTOM_OWNER_ID, experiencePoints: L5_XP, initiativeBonus: 3, speed: 30,
        rulesEdition: "EDITION_2014",
        hitPoints: { current: 44, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 5, die: "d10", spent: 0 },
        abilityScores: { strength: 16, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: [], skills: [], toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ position: 0, name: "Ranger", classId: customRangerClassId, level: 5 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CUSTOM_FIXTURE_ID } });
  });

  it("rejects a custom feat named after a catalog style the class doesn't offer (Great Weapon Fighting, Fighter/Paladin-only)", async () => {
    const res = await takeCustomStyle({ name: "Great Weapon Fighting", description: "reroll 1s and 2s" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not an offered Fighting Style/);
  });

  it("accepts a custom feat named after a catalog style the class DOES offer (Archery)", async () => {
    const res = await takeCustomStyle({ name: "Archery", description: "+2 ranged" });
    expect(res.status).toBe(200);
  });

  it("accepts a genuinely homebrew custom style name that matches no catalog row", async () => {
    const res = await takeCustomStyle({ name: "Whirling Blades (homebrew)", description: "made up" });
    expect(res.status).toBe(200);
  });
});
