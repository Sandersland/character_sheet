/**
 * Eldritch Knight Weapon Bond (2014, PHB'14 p.75, #1854) route tests. A
 * level-3 2014 Eldritch Knight can bond up to 2 owned weapons via the shared
 * ability endpoint (never PATCH), each write is audited + undoable, a 3rd
 * bond is rejected (409, cap enforced), and the "Summon Bonded Weapon"
 * bonus-action AvailableAction is served only once eligible and enabled only
 * once >=1 weapon is bonded. A non-EK / sub-L3 / 2024 EK gets none of it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { readPinnedEvents } from "@/test-support/events.js";
import { authCookie } from "@/test-support/auth.js";
import { inventoryItemFixtureData } from "@/test-support/inventory-snapshot-fixture.js";
import { WEAPON_BOND_LEVEL, WEAPON_BOND_LIMIT } from "@/lib/classes/weapon-bond.js";

const OWNER_ID = "owner-weapon-bond";
let COOKIE: string;
const FIXTURE_ID = "test-weapon-bond-character-1";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Weapon Bond Test Eldritch Knight",
  alignment: "Lawful Neutral",
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 28, max: 28, temp: 0 },
  hitDice: { total: 3, die: "d10" },
  abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  rulesEdition: "EDITION_2014" as const,
};

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}
const url = `/api/characters/${FIXTURE_ID}/abilities/weapon-bond/transactions`;
const inventoryUrl = `/api/characters/${FIXTURE_ID}/inventory/transactions`;

// XP thresholds for levels 1-3 (standard 5e table, both editions) — single-class
// characters resolve their entry level through the XP-DERIVED total
// (effectiveEntryLevel), so the fixture's experiencePoints must actually match
// `level`, not just the per-class column.
const XP_FOR_LEVEL: Record<number, number> = { 1: 0, 2: 300, 3: 900 };

async function createEldritchKnight(level: number, edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2014") {
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      experiencePoints: XP_FOR_LEVEL[level],
      rulesEdition: edition,
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "fighter", subclass: "Eldritch Knight", position: 0, level }] },
    },
  });
}

async function makeWeapon(name: string): Promise<string> {
  const row = await prisma.inventoryItem.create({
    data: inventoryItemFixtureData({
      characterId: FIXTURE_ID,
      name,
      category: "weapon",
      weapon: { damageDiceCount: 1, damageDiceFaces: 8, damageType: "slashing" },
    }),
  });
  return row.id;
}

async function makeGear(name: string): Promise<string> {
  const row = await prisma.inventoryItem.create({
    data: inventoryItemFixtureData({ characterId: FIXTURE_ID, name, category: "gear" }),
  });
  return row.id;
}

describe("POST /api/characters/:id/abilities/weapon-bond/transactions", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createEldritchKnight(WEAPON_BOND_LEVEL);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("bonds a weapon, setting the flag and logging an undoable event", async () => {
    const swordId = await makeWeapon("Longsword");

    const res = await agent()
      .post(url)
      .send({ operations: [{ type: "bondWeapon", inventoryItemId: swordId }] });
    expect(res.status).toBe(200);

    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: swordId } });
    expect(item.weaponBonded).toBe(true);

    const wireItem = res.body.inventory.find((i: { id: string }) => i.id === swordId);
    expect(wireItem.weaponBonded).toBe(true);

    const events = await prisma.characterEvent.findMany({ where: { characterId: FIXTURE_ID, type: "weaponBonded" } });
    expect(events).toHaveLength(1);
    expect(events[0].entityId).toBe(swordId);

    const batchId = events[0].batchId;
    const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`);
    expect(undo.status).toBe(200);
    const reverted = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: swordId } });
    expect(reverted.weaponBonded).toBe(false);
  });

  it("bonds up to the 2-weapon cap, and rejects a 3rd with 409", async () => {
    const a = await makeWeapon("Longsword");
    const b = await makeWeapon("Rapier");
    const c = await makeWeapon("Shortsword");

    expect((await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: a }] })).status).toBe(200);
    expect((await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: b }] })).status).toBe(200);

    const third = await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: c }] });
    expect(third.status).toBe(409);
    expect(third.body.error).toMatch(new RegExp(`${WEAPON_BOND_LIMIT}`));

    const bondedCount = await prisma.inventoryItem.count({ where: { characterId: FIXTURE_ID, weaponBonded: true } });
    expect(bondedCount).toBe(WEAPON_BOND_LIMIT);
  });

  // TOCTOU regression (claude-review on #1887): two concurrent bondWeapon
  // requests each read the pre-write bonded count, so without a lock inside
  // the transaction both can pass `< WEAPON_BOND_LIMIT` and both commit,
  // landing a 3rd bonded weapon past the cap. Fires two real concurrent HTTP
  // requests (separate connections/transactions, like two browser tabs)
  // rather than sequential awaits, which would never exercise the race.
  it("bonding two weapons concurrently at 1-away-from-cap never exceeds the 2-weapon cap", async () => {
    const already = await makeWeapon("Longsword");
    await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: already }] });

    const b = await makeWeapon("Rapier");
    const c = await makeWeapon("Shortsword");

    const [resB, resC] = await Promise.all([
      agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: b }] }),
      agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: c }] }),
    ]);

    const statuses = [resB.status, resC.status].sort();
    expect(statuses).toEqual([200, 409]);

    const bondedCount = await prisma.inventoryItem.count({ where: { characterId: FIXTURE_ID, weaponBonded: true } });
    expect(bondedCount).toBe(WEAPON_BOND_LIMIT);
  });

  // Duplicate-event regression (claude-review round 2 on #1887): the
  // already-bonded guard used to run off the pre-lock `item` read, so two
  // concurrent bondWeapon calls on the SAME item could both see
  // `weaponBonded: false`, both write `true`, and both log a `weaponBonded`
  // event for one real transition — corrupting LIFO undo (undoing the
  // second-logged event left the first's stale event to fire an unexpected
  // re-bond on the next undo). The guard now re-reads under the Character
  // row's FOR UPDATE lock, so exactly one request sees the true
  // false→true transition and the other is rejected off the now-committed
  // state, same as two genuinely sequential calls would be.
  it("bonding the same weapon concurrently logs exactly one weaponBonded event, and undo cleanly reverts it", async () => {
    const swordId = await makeWeapon("Longsword");

    const [resA, resB] = await Promise.all([
      agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: swordId }] }),
      agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: swordId }] }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 400]);

    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: swordId } });
    expect(item.weaponBonded).toBe(true);

    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE_ID, type: "weaponBonded", entityId: swordId },
    });
    expect(events).toHaveLength(1);

    const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${events[0].batchId}/revert`);
    expect(undo.status).toBe(200);
    const reverted = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: swordId } });
    expect(reverted.weaponBonded).toBe(false);
  });

  // Same duplicate-event shape as bondWeapon's own concurrency test above,
  // for unbondWeapon's symmetric lock.
  it("unbonding the same weapon concurrently logs exactly one weaponUnbonded event, and undo cleanly reverts it", async () => {
    const swordId = await makeWeapon("Longsword");
    await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: swordId }] });

    const [resA, resB] = await Promise.all([
      agent().post(url).send({ operations: [{ type: "unbondWeapon", inventoryItemId: swordId }] }),
      agent().post(url).send({ operations: [{ type: "unbondWeapon", inventoryItemId: swordId }] }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 400]);

    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: swordId } });
    expect(item.weaponBonded).toBe(false);

    const events = await prisma.characterEvent.findMany({
      where: { characterId: FIXTURE_ID, type: "weaponUnbonded", entityId: swordId },
    });
    expect(events).toHaveLength(1);

    const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${events[0].batchId}/revert`);
    expect(undo.status).toBe(200);
    const reverted = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: swordId } });
    expect(reverted.weaponBonded).toBe(true);
  });

  it("rejects bonding a non-weapon item", async () => {
    const potionId = await makeGear("Potion of Healing");
    const res = await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: potionId }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a weapon/i);
  });

  it("rejects bonding an already-bonded weapon", async () => {
    const swordId = await makeWeapon("Longsword");
    await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: swordId }] });
    const again = await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: swordId }] });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/already bonded/i);
  });

  it("unbonds a weapon — always legal", async () => {
    const swordId = await makeWeapon("Longsword");
    await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: swordId }] });

    const res = await agent().post(url).send({ operations: [{ type: "unbondWeapon", inventoryItemId: swordId }] });
    expect(res.status).toBe(200);
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: swordId } });
    expect(item.weaponBonded).toBe(false);
  });

  it("rejects unbonding a weapon that isn't bonded", async () => {
    const swordId = await makeWeapon("Longsword");
    const res = await agent().post(url).send({ operations: [{ type: "unbondWeapon", inventoryItemId: swordId }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not bonded/i);
  });

  it("removing a bonded weapon from inventory self-reconciles — the bonded count drops with no dangling state", async () => {
    const a = await makeWeapon("Longsword");
    const b = await makeWeapon("Rapier");
    await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: a }] });
    await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: b }] });

    const remove = await agent()
      .post(inventoryUrl)
      .send({ operations: [{ type: "remove", inventoryItemId: a }] });
    expect(remove.status).toBe(200);
    expect(remove.body.inventory.find((i: { id: string }) => i.id === a)).toBeUndefined();

    const bondedCount = await prisma.inventoryItem.count({ where: { characterId: FIXTURE_ID, weaponBonded: true } });
    expect(bondedCount).toBe(1);

    // A 2nd weapon can now be bonded again (the removed slot freed up the cap).
    const c = await makeWeapon("Shortsword");
    const bondAgain = await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: c }] });
    expect(bondAgain.status).toBe(200);
  });

  it("serves Summon Bonded Weapon disabled with 0 bonded, then enabled once a weapon is bonded", async () => {
    const swordId = await makeWeapon("Longsword");

    const before = await agent().get(`/api/characters/${FIXTURE_ID}`);
    const beforeAction = before.body.availableActions.find((a: { key: string }) => a.key === "summonBondedWeapon");
    expect(beforeAction).toBeDefined();
    expect(beforeAction.cost).toBe("bonusAction");
    expect(beforeAction.enabled).toBe(false);

    const bonded = await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: swordId }] });
    const afterAction = bonded.body.availableActions.find(
      (a: { key: string }) => a.key === "summonBondedWeapon",
    );
    expect(afterAction.enabled).toBe(true);
  });

  it("pins the audit trail of one Weapon Bond", async () => {
    const swordId = await makeWeapon("Longsword");
    await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: swordId }] });

    expect(await readPinnedEvents(FIXTURE_ID, ["weaponBonded"])).toEqual([
      {
        category: "inventory",
        type: "weaponBonded",
        summary: "Bonded Longsword (Weapon Bond)",
        before: { weaponBonded: false },
        after: { weaponBonded: true },
        data: null,
      },
    ]);
  });
});

describe("Weapon Bond eligibility gates", () => {
  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("rejects a sub-level-3 Eldritch Knight", async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createEldritchKnight(WEAPON_BOND_LEVEL - 1);
    const swordId = await makeWeapon("Longsword");

    const res = await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: swordId }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/eldritch knight/i);

    const character = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect(character.body.availableActions.find((a: { key: string }) => a.key === "summonBondedWeapon")).toBeUndefined();
  });

  it("rejects a non-Eldritch-Knight Fighter", async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        experiencePoints: 900,
        ownerId: OWNER_ID,
        classEntries: { create: [{ name: "fighter", subclass: "Champion", position: 0, level: WEAPON_BOND_LEVEL }] },
      },
    });
    const swordId = await makeWeapon("Longsword");

    const res = await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: swordId }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/eldritch knight/i);
  });

  it("rejects a 2024 Eldritch Knight (Weapon Bond is 2014-only, #1854)", async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await createEldritchKnight(WEAPON_BOND_LEVEL, "EDITION_2024");
    const swordId = await makeWeapon("Longsword");

    const res = await agent().post(url).send({ operations: [{ type: "bondWeapon", inventoryItemId: swordId }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/eldritch knight/i);

    const character = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect(character.body.availableActions.find((a: { key: string }) => a.key === "summonBondedWeapon")).toBeUndefined();
  });
});
