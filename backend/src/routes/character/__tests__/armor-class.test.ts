/**
 * AC-derivation route tests (#361). armorClass is derived at read time from the
 * equipped body armor + effective Dex (per category) + shield, never persisted.
 * Real Postgres in beforeEach, supertest against createApp(). Custom armor is
 * acquired equipped so no catalog seeding is needed.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../../app.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../../lib/prisma.js";
import { ensureTestOwner } from "../../../test-support/owner.js";
import { authCookie } from "../../../test-support/auth.js";

const OWNER_ID = "owner-armor-class";
let COOKIE: string;

const FIXTURE_ID = "test-armor-class-character-1";

// Dex 16 (+3) so light/medium/unarmored differences are visible.
const FIXTURE = {
  id: FIXTURE_ID,
  name: "AC Test Fixture",
  alignment: "True Neutral",
  experiencePoints: 0,
  initiativeBonus: 3,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 16, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

const url = `/api/characters/${FIXTURE_ID}/inventory/transactions`;
const get = () => supertest.agent(createApp()).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
const acquire = (custom: unknown, equipped = true) =>
  supertest.agent(createApp()).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "acquire", custom, equipped }] });

const leather = { name: "Test Leather", category: "armor", armor: { armorCategory: "light", baseArmorClass: 11 } };
const halfPlate = { name: "Test Half Plate", category: "armor", armor: { armorCategory: "medium", baseArmorClass: 15, dexModifierMax: 2 } };
const chainMail = { name: "Test Chain Mail", category: "armor", armor: { armorCategory: "heavy", baseArmorClass: 16 } };
const shield = { name: "Test Shield", category: "armor", armor: { armorCategory: "shield", baseArmorClass: 2 } };

describe("derived armorClass", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    await prisma.character.create({ data: { ...FIXTURE, ownerId: OWNER_ID, spellcasting: Prisma.JsonNull } });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("is 10 + Dex when nothing is equipped", async () => {
    const res = await get();
    expect(res.body.armorClass).toBe(13); // 10 + 3
  });

  it("equipping Leather gives 11 + full Dex", async () => {
    const res = await acquire(leather);
    expect(res.body.armorClass).toBe(14); // 11 + 3
  });

  it("heavy Chain Mail ignores Dex (16)", async () => {
    const res = await acquire(chainMail);
    expect(res.body.armorClass).toBe(16);
  });

  it("medium Half Plate caps Dex at +2", async () => {
    const res = await acquire(halfPlate);
    expect(res.body.armorClass).toBe(17); // 15 + min(3, 2)
  });

  it("a shield adds +2 on top of body armor", async () => {
    await acquire(chainMail);
    const res = await acquire(shield);
    expect(res.body.armorClass).toBe(18); // 16 + 2
  });

  it("reverts to 10 + Dex when armor is unequipped", async () => {
    const acq = await acquire(leather);
    expect(acq.body.armorClass).toBe(14);
    const inventoryItemId = acq.body.inventory[0].id;
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).post(url)
      .send({ operations: [{ type: "setEquipped", inventoryItemId, equipped: false }] });
    expect(res.body.armorClass).toBe(13);
  });

  it("re-derives from effective Dex with nothing persisted on armorClass", async () => {
    await acquire(halfPlate);
    // Raise Dex to 20 (+5); medium cap still limits the bonus to +2.
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: { abilityScores: { ...FIXTURE.abilityScores, dexterity: 20 } },
    });
    const res = await get();
    expect(res.body.armorClass).toBe(17); // 15 + min(5, 2), unchanged by higher Dex
    // And unarmored re-derives to reflect the new Dex.
    const bodyId = res.body.inventory[0].id;
    const unequipped = await supertest.agent(createApp()).set("Cookie", COOKIE).post(url)
      .send({ operations: [{ type: "setEquipped", inventoryItemId: bodyId, equipped: false }] });
    expect(unequipped.body.armorClass).toBe(15); // 10 + 5
  });

  it("only one body armor occupies the BODY slot; swapping re-derives AC", async () => {
    const first = await acquire(leather); // 11 + 3 = 14, auto-equipped into BODY
    expect(first.body.armorClass).toBe(14);
    // A second body armor can't auto-equip while BODY is full — it stays in the bag.
    const second = await acquire(chainMail);
    expect(second.body.armorClass).toBe(14);
    const leatherId = second.body.inventory.find((i: { name: string; id: string }) => i.name === "Test Leather")!.id;
    const chainId = second.body.inventory.find((i: { name: string; id: string }) => i.name === "Test Chain Mail")!.id;
    await supertest.agent(createApp()).set("Cookie", COOKIE).post(url)
      .send({ operations: [{ type: "setEquipped", inventoryItemId: leatherId, equipped: false }] });
    const res = await supertest.agent(createApp()).set("Cookie", COOKIE).post(url)
      .send({ operations: [{ type: "equip", inventoryItemId: chainId, slot: "BODY" }] });
    expect(res.body.armorClass).toBe(16);
  });

  it("barbarian Unarmored Defense adds Con while unarmored, and shields stack", async () => {
    // Dex 16 (+3), Con 14 (+2): 10 + 3 + 2 = 15.
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: {
        abilityScores: { ...FIXTURE.abilityScores, constitution: 14 },
        classEntries: { create: [{ name: "barbarian", position: 0 }] },
      },
    });
    const res = await get();
    expect(res.body.armorClass).toBe(15);
    const withShield = await acquire(shield);
    expect(withShield.body.armorClass).toBe(17);
  });

  it("monk Unarmored Defense adds Wis while unarmored but is lost with a shield", async () => {
    // Dex 16 (+3), Wis 18 (+4): 10 + 3 + 4 = 17; a shield disqualifies the monk formula (PHB p.78).
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: {
        abilityScores: { ...FIXTURE.abilityScores, wisdom: 18 },
        classEntries: { create: [{ name: "monk", position: 0 }] },
      },
    });
    const res = await get();
    expect(res.body.armorClass).toBe(17);
    const withShield = await acquire(shield);
    expect(withShield.body.armorClass).toBe(15); // base 10 + Dex 3 + shield 2, not monk 17
  });

  it("equipping body armor overrides a barbarian's Unarmored Defense", async () => {
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: {
        abilityScores: { ...FIXTURE.abilityScores, constitution: 14 },
        classEntries: { create: [{ name: "barbarian", position: 0 }] },
      },
    });
    const res = await acquire(chainMail);
    expect(res.body.armorClass).toBe(16); // heavy armor wins, Con ignored
  });

  it("a feat armorClass improvement stacks on the derived base", async () => {
    await acquire(chainMail); // 16
    // Level 4 (2700 XP) grants one advancement slot, so the injected feat isn't clamped out.
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: {
        experiencePoints: 2700,
        hitDice: { total: 4, die: "d8", spent: 0 },
        resources: {
          used: {},
          maneuversKnown: [],
          toolProficienciesKnown: [],
          fightingStyle: null,
          advancements: [
            {
              id: "ac-feat",
              level: 4,
              kind: "feat",
              abilityDeltas: {},
              hpDelta: 0,
              initDelta: 0,
              featName: "Test AC Feat",
              featDescription: "test",
              improvements: [{ target: "armorClass", amount: 1 }],
            },
          ],
        },
      },
    });
    const res = await get();
    expect(res.body.armorClass).toBe(17); // 16 + 1 feat bonus
    expect(res.body.armorClassBreakdown).toEqual([
      { label: "Test Chain Mail", value: 16 },
      { label: "Feats", value: 1 },
    ]);
  });

  it("includes a Defense fighting-style entry in the breakdown while armored", async () => {
    // Fighter L1 so the stored style survives the read-clamp.
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: {
        classEntries: { create: [{ name: "fighter", position: 0 }] },
        resources: {
          used: {},
          maneuversKnown: [],
          toolProficienciesKnown: [],
          fightingStyle: "defense",
          advancements: [],
        },
      },
    });
    const res = await acquire(chainMail);
    expect(res.body.armorClass).toBe(17); // 16 + 1 Defense
    expect(res.body.armorClassBreakdown).toEqual([
      { label: "Test Chain Mail", value: 16 },
      { label: "Defense fighting style", value: 1 },
    ]);
    const sum = res.body.armorClassBreakdown.reduce(
      (t: number, p: { value: number }) => t + p.value,
      0,
    );
    expect(sum).toBe(res.body.armorClass);
  });

  it("returns an armorClassBreakdown that sums to armorClass", async () => {
    const res = await get();
    expect(res.body.armorClassBreakdown).toEqual([
      { label: "Unarmored", value: 10 },
      { label: "Dex", value: 3 },
    ]);
    const sum = res.body.armorClassBreakdown.reduce(
      (t: number, p: { value: number }) => t + p.value,
      0,
    );
    expect(sum).toBe(res.body.armorClass);
  });

  it("breaks down Half Plate + Shield into labeled parts", async () => {
    await acquire(halfPlate);
    const res = await acquire(shield);
    expect(res.body.armorClass).toBe(19); // 15 + min(3, 2) + 2
    expect(res.body.armorClassBreakdown).toEqual([
      { label: "Test Half Plate", value: 15 },
      { label: "Dex (max +2)", value: 2 },
      { label: "Shield", value: 2 },
    ]);
  });
});
