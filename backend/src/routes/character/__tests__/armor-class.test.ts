import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-armor-class";
let COOKIE: string;

const FIXTURE_ID = "test-armor-class-character-1";

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
const get = () => supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}`);
const acquire = (custom: unknown, equipped = true) =>
  supertest.agent(app).set("Cookie", COOKIE).post(url).send({ operations: [{ type: "acquire", custom, equipped }] });

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
    expect(res.body.armorClass).toBe(13);
  });

  it("equipping Leather gives 11 + full Dex", async () => {
    const res = await acquire(leather);
    expect(res.body.armorClass).toBe(14);
  });

  it("heavy Chain Mail ignores Dex (16)", async () => {
    const res = await acquire(chainMail);
    expect(res.body.armorClass).toBe(16);
  });

  it("medium Half Plate caps Dex at +2", async () => {
    const res = await acquire(halfPlate);
    expect(res.body.armorClass).toBe(17);
  });

  it("a shield adds +2 on top of body armor", async () => {
    await acquire(chainMail);
    const res = await acquire(shield);
    expect(res.body.armorClass).toBe(18);
  });

  it("reverts to 10 + Dex when armor is unequipped", async () => {
    const acq = await acquire(leather);
    expect(acq.body.armorClass).toBe(14);
    const inventoryItemId = acq.body.inventory[0].id;
    const res = await supertest.agent(app).set("Cookie", COOKIE).post(url)
      .send({ operations: [{ type: "setEquipped", inventoryItemId, equipped: false }] });
    expect(res.body.armorClass).toBe(13);
  });

  it("re-derives from effective Dex with nothing persisted on armorClass", async () => {
    await acquire(halfPlate);

    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: { abilityScores: { ...FIXTURE.abilityScores, dexterity: 20 } },
    });
    const res = await get();
    expect(res.body.armorClass).toBe(17);

    const bodyId = res.body.inventory[0].id;
    const unequipped = await supertest.agent(app).set("Cookie", COOKIE).post(url)
      .send({ operations: [{ type: "setEquipped", inventoryItemId: bodyId, equipped: false }] });
    expect(unequipped.body.armorClass).toBe(15);
  });

  it("only one body armor occupies the BODY slot; swapping re-derives AC", async () => {
    const first = await acquire(leather);
    expect(first.body.armorClass).toBe(14);

    const second = await acquire(chainMail);
    expect(second.body.armorClass).toBe(14);
    const leatherId = second.body.inventory.find((i: { name: string; id: string }) => i.name === "Test Leather")!.id;
    const chainId = second.body.inventory.find((i: { name: string; id: string }) => i.name === "Test Chain Mail")!.id;
    await supertest.agent(app).set("Cookie", COOKIE).post(url)
      .send({ operations: [{ type: "setEquipped", inventoryItemId: leatherId, equipped: false }] });
    const res = await supertest.agent(app).set("Cookie", COOKIE).post(url)
      .send({ operations: [{ type: "equip", inventoryItemId: chainId, slot: "BODY" }] });
    expect(res.body.armorClass).toBe(16);
  });

  it("barbarian Unarmored Defense adds Con while unarmored, and shields stack", async () => {

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
    // A shield disqualifies the monk AC formula (PHB p.78).
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
    expect(withShield.body.armorClass).toBe(15);
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
    expect(res.body.armorClass).toBe(16);
  });

  it("a feat armorClass improvement stacks on the derived base", async () => {
    await acquire(chainMail);

    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: {
        experiencePoints: 2700,
        hitDice: { total: 4, die: "d8", spent: 0 },
        classEntries: { create: [{ name: "Wizard", position: 0, level: 4 }] },
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
    expect(res.body.armorClass).toBe(17);
    expect(res.body.armorClassBreakdown).toEqual([
      { label: "Test Chain Mail", value: 16 },
      { label: "Feats", value: 1 },
    ]);
  });

  it("applies the Defense Fighting Style feat's armorClassWhileArmored only while armored (#1137)", async () => {

    const fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" }, select: { id: true } })).id;
    await prisma.character.update({
      where: { id: FIXTURE_ID },
      data: {
        classEntries: { create: [{ name: "Fighter", classId: fighterClassId, position: 0, level: 1 }] },
        resources: {
          used: {},
          maneuversKnown: [],
          toolProficienciesKnown: [],
          fightingStyle: null,
          advancements: [
            {
              id: "fs-defense", level: 1, kind: "feat", slot: "fightingStyle",
              abilityDeltas: {}, hpDelta: 0, initDelta: 0,
              featName: "Defense", featDescription: "test",
              improvements: [{ target: "armorClassWhileArmored", amount: 1 }],
            },
          ],
        },
      },
    });

    const unarmored = await get();
    expect(unarmored.body.armorClass).toBe(13);

    const armored = await acquire(chainMail);
    expect(armored.body.armorClass).toBe(17);
    expect(armored.body.armorClassBreakdown).toContainEqual({ label: "Defense", value: 1 });
    const sum = armored.body.armorClassBreakdown.reduce(
      (t: number, p: { value: number }) => t + p.value,
      0,
    );
    expect(sum).toBe(armored.body.armorClass);
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
    expect(res.body.armorClass).toBe(19);
    expect(res.body.armorClassBreakdown).toEqual([
      { label: "Test Half Plate", value: 15 },
      { label: "Dex (max +2)", value: 2 },
      { label: "Shield", value: 2 },
    ]);
  });

  // Draconic Resilience: AC = 13 + Dex modifier while unarmored (#1122, PHB'14 p.106).

  describe("Draconic Resilience (#1122, 2014)", () => {
    beforeEach(async () => {
      await prisma.character.update({
        where: { id: FIXTURE_ID },
        data: {
          rulesEdition: "EDITION_2014",
          abilityScores: { ...FIXTURE.abilityScores, dexterity: 14 },
          classEntries: { create: [{ name: "Sorcerer", subclass: "Draconic Bloodline", position: 0 }] },
        },
      });
    });

    it("unarmored Draconic sorcerer with Dex 14 has AC 15, +2 with a shield", async () => {
      const res = await get();
      expect(res.body.armorClass).toBe(15);
      expect(res.body.armorClassBreakdown).toEqual([
        { label: "Draconic Resilience", value: 13 },
        { label: "Dex", value: 2 },
      ]);
      const withShield = await acquire(shield);
      expect(withShield.body.armorClass).toBe(17);
    });

    it("wearing armor lets the armor formula win (feature inactive)", async () => {
      const res = await acquire(chainMail);
      expect(res.body.armorClass).toBe(16);
      expect(res.body.armorClassBreakdown).toEqual([{ label: "Test Chain Mail", value: 16 }]);
    });

    it("a non-Draconic sorcerer subclass does not get the override", async () => {
      await prisma.characterClassEntry.updateMany({
        where: { characterId: FIXTURE_ID },
        data: { subclass: "Wild Magic" },
      });
      const res = await get();
      expect(res.body.armorClass).toBe(12);
    });

    it("is gated to EDITION_2014 (2024 fork not implemented, #1122)", async () => {
      await prisma.character.update({ where: { id: FIXTURE_ID }, data: { rulesEdition: "EDITION_2024" } });
      const res = await get();
      expect(res.body.armorClass).toBe(12);
    });
  });
});
