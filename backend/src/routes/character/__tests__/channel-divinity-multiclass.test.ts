// PHB'14 p.164: gaining Channel Divinity from a second class grants no additional use — one shared pool, total = the MAX any class grants, never the sum.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-cd-multiclass-1340";
let COOKIE: string;

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}

const BASE = {
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 50, max: 50, temp: 0 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

interface CDPool {
  key: string;
  total: number;
  used: number;
  remaining: number;
}

function cdPools(body: { resources: { pools: CDPool[] } }): CDPool[] {
  return body.resources.pools.filter((p) => p.key === "channelDivinity");
}

describe("Cleric/Paladin multiclass — channelDivinity pool merge (#1340, PHB'14 p.164)", () => {
  let clericId: string;
  let paladinId: string;
  let lifeDomainId: string;
  let oathOfDevotionId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    clericId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Cleric" } })).id;
    paladinId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Paladin" } })).id;
    // Production always sets subclassId alongside the subclass string — resolved here to match that shape, though the pool merge itself keys off the class name strings, not these ids.
    lifeDomainId = (await prisma.subclass.findFirstOrThrow({ where: { classId: clericId, name: "Life Domain" } })).id;
    oathOfDevotionId = (await prisma.subclass.findFirstOrThrow({ where: { classId: paladinId, name: "Oath of Devotion" } })).id;
  });

  describe("Cleric 2 / Paladin 3 (total level 5) — MC_LOW", () => {
    const CHAR_ID = "test-1340-mc-low";

    beforeEach(async () => {
      await prisma.character.create({
        data: {
          ...BASE,
          id: CHAR_ID,
          name: "MC Low",
          ownerId: OWNER_ID,
          experiencePoints: 6500,
          hitDice: { total: 5, die: "d8", spent: 0 },
          abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 16, charisma: 14 },
          spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
          resources: Prisma.JsonNull,
          classEntries: {
            create: [
              { name: "cleric", subclass: "Life Domain", subclassId: lifeDomainId, classId: clericId, position: 0, level: 2 },
              { name: "paladin", subclass: "Oath of Devotion", subclassId: oathOfDevotionId, classId: paladinId, position: 1, level: 3 },
            ],
          },
        },
      });
    });

    afterEach(async () => {
      await prisma.character.deleteMany({ where: { id: CHAR_ID } });
    });

    it("serializes with status 200 — this is a 500 today (the headline regression)", async () => {
      const res = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(res.status).toBe(200);
    });

    it("has exactly one channelDivinity pool with total 2 (max(cleric@2→2, paladin@3→2))", async () => {
      const res = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(res.status).toBe(200);
      const pools = cdPools(res.body);
      expect(pools).toHaveLength(1);
      expect(pools[0].total).toBe(2);
    });
  });

  describe("Cleric 6 / Paladin 4 (total level 10) — MC_HIGH", () => {
    const CHAR_ID = "test-1340-mc-high";

    beforeEach(async () => {
      await prisma.character.create({
        data: {
          ...BASE,
          id: CHAR_ID,
          name: "MC High",
          ownerId: OWNER_ID,
          experiencePoints: 64000,
          hitDice: { total: 10, die: "d8", spent: 0 },
          abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 16, charisma: 14 },
          spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
          resources: Prisma.JsonNull,
          classEntries: {
            create: [
              { name: "cleric", classId: clericId, position: 0, level: 6 },
              { name: "paladin", subclass: "Oath of Devotion", subclassId: oathOfDevotionId, classId: paladinId, position: 1, level: 4 },
            ],
          },
        },
      });
    });

    afterEach(async () => {
      await prisma.character.deleteMany({ where: { id: CHAR_ID } });
    });

    it("has exactly one channelDivinity pool with total 3 — the max (cleric@6→3), NOT the sum 5", async () => {
      const res = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(res.status).toBe(200);
      const pools = cdPools(res.body);
      expect(pools).toHaveLength(1);
      expect(pools[0].total).toBe(3);
    });

    it("availableActions has exactly one enabled Channel Divinity card", async () => {
      const res = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(res.status).toBe(200);
      const cards = (res.body.availableActions as { key: string; name: string; cost: string; enabled: boolean }[]).filter(
        (a) => a.name === "Channel Divinity",
      );
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({ key: "channelDivinity", cost: "action", enabled: true });
    });

    // The level-down crosses a real total change (3 → 2) — paladin@4's own 2 doesn't beat cleric@2's 2, so the clamp is a meaningful assertion.
    it("persisted used clamps to the current total after a level-down (cleric 6→2, no reconciler needed)", async () => {
      await prisma.character.update({
        where: { id: CHAR_ID },
        data: {
          resources: {
            used: { channelDivinity: 3 },
            maneuversKnown: [],
            toolProficienciesKnown: [],
            choicesKnown: {},
            advancements: [],
          },
        },
      });
      const before = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(cdPools(before.body)[0]).toMatchObject({ total: 3, used: 3, remaining: 0 });

      // Clamp-on-read (buildResourcesPayload) must cap `used` to the new total without any LEVEL_GATED_RECONCILERS entry (derive, don't persist).
      await prisma.characterClassEntry.updateMany({
        where: { characterId: CHAR_ID, name: "cleric" },
        data: { level: 2 },
      });
      await prisma.character.update({ where: { id: CHAR_ID }, data: { experiencePoints: 6500 } });

      const after = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(after.status).toBe(200);
      expect(cdPools(after.body)[0]).toMatchObject({ total: 2, used: 2, remaining: 0 });
    });

    it("a long rest restores the single merged pool to full (rest.ts's collectEntryScopedPools call site)", async () => {
      await prisma.character.update({
        where: { id: CHAR_ID },
        data: {
          resources: {
            used: { channelDivinity: 2 },
            maneuversKnown: [],
            toolProficienciesKnown: [],
            choicesKnown: {},
            advancements: [],
          },
        },
      });
      const res = await agent().post(`/api/characters/${CHAR_ID}/hp`).send({ operations: [{ type: "longRest" }] });
      expect(res.status).toBe(200);
      const pools = cdPools(res.body);
      expect(pools).toHaveLength(1);
      expect(pools[0].remaining).toBe(3);
    });
  });

  describe("Paladin 4 (primary) / Cleric 6 (secondary) — MC_HIGH_PALADIN_PRIMARY (order-independence)", () => {
    const CHAR_ID = "test-1340-mc-high-paladin-primary";

    beforeEach(async () => {
      await prisma.character.create({
        data: {
          ...BASE,
          id: CHAR_ID,
          name: "MC High Paladin Primary",
          ownerId: OWNER_ID,
          experiencePoints: 64000,
          hitDice: { total: 10, die: "d10", spent: 0 },
          abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 16, charisma: 14 },
          spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
          resources: Prisma.JsonNull,
          classEntries: {
            create: [
              { name: "paladin", subclass: "Oath of Devotion", subclassId: oathOfDevotionId, classId: paladinId, position: 0, level: 4 },
              { name: "cleric", classId: clericId, position: 1, level: 6 },
            ],
          },
        },
      });
    });

    afterEach(async () => {
      await prisma.character.deleteMany({ where: { id: CHAR_ID } });
    });

    it("still exactly one pool at total 3 — the max comes from the non-primary entry", async () => {
      const res = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(res.status).toBe(200);
      const pools = cdPools(res.body);
      expect(pools).toHaveLength(1);
      expect(pools[0].total).toBe(3);
    });
  });

  describe("control: single-class Cleric 6 — unchanged", () => {
    const CHAR_ID = "test-1340-control-cleric6";

    beforeEach(async () => {
      await prisma.character.create({
        data: {
          ...BASE,
          id: CHAR_ID,
          name: "Control Cleric 6",
          ownerId: OWNER_ID,
          experiencePoints: 14000,
          hitDice: { total: 6, die: "d8", spent: 0 },
          abilityScores: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 16, charisma: 10 },
          spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
          resources: Prisma.JsonNull,
          classEntries: { create: [{ name: "cleric", classId: clericId, position: 0, level: 6 }] },
        },
      });
    });

    afterEach(async () => {
      await prisma.character.deleteMany({ where: { id: CHAR_ID } });
    });

    it("has exactly one channelDivinity pool at total 3, same as before entry-scoping (#1315)", async () => {
      const res = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(res.status).toBe(200);
      const pools = cdPools(res.body);
      expect(pools).toHaveLength(1);
      expect(pools[0].total).toBe(3);
    });
  });
});
