/**
 * Cleric/Paladin multiclass — the sheet must SERIALIZE, not throw (#1340).
 *
 * Before the fix, `collectEntryScopedPools` threw on the duplicate
 * `channelDivinity` pool key both classes' resourceFn emit, so
 * GET /api/characters/:id 500'd for any Cleric 2+/Paladin 3+ character (the
 * throw is reached through buildResourcesView with no try/catch on the path).
 *
 * PHB'14 p.164 (multiclassing): gaining Channel Divinity again from a second
 * class grants that class's effects but no additional use — one shared pool,
 * total = the MAX any single class grants, never the sum. This file is the
 * route-level proof (not just the pure derivation) that a Cleric/Paladin
 * character reads correctly, including through rest and a level-down.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-cd-multiclass-1340";
let COOKIE: string;

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
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
    // #1524: production always sets subclassId alongside the subclass string
    // (routes/character/class.ts, level-up.ts) — resolved here so these
    // fixtures match that shape even though channelDivinity's pool merge
    // itself is driven by the "cleric"/"paladin" name strings, not these ids.
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
          experiencePoints: 6500, // level 5 (cleric 2 + paladin 3), no pending level-up
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

    it("has exactly one channelDivinity pool with total 1 (max(cleric@2→1, paladin@3→1))", async () => {
      const res = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(res.status).toBe(200);
      const pools = cdPools(res.body);
      expect(pools).toHaveLength(1);
      expect(pools[0].total).toBe(1);
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
          experiencePoints: 64000, // level 10 (cleric 6 + paladin 4), no pending level-up
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

    it("has exactly one channelDivinity pool with total 2 — the max (cleric@6→2), NOT the sum 3", async () => {
      const res = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(res.status).toBe(200);
      const pools = cdPools(res.body);
      expect(pools).toHaveLength(1);
      expect(pools[0].total).toBe(2);
    });

    // #1340 Chunk 2: the merged DERIVED_ACTIONS row must surface as exactly one
    // card on the wire, not the two duplicate channelDivinityCleric/
    // channelDivinityPaladin cards a Cleric/Paladin multiclass used to get.
    it("availableActions has exactly one enabled Channel Divinity card", async () => {
      const res = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(res.status).toBe(200);
      const cards = (res.body.availableActions as { key: string; name: string; cost: string; enabled: boolean }[]).filter(
        (a) => a.name === "Channel Divinity",
      );
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({ key: "channelDivinity", cost: "action", enabled: true });
    });

    it("persisted used clamps to the current total after a level-down (cleric 6→2, no reconciler needed)", async () => {
      // Spend both uses at the current (total 2) state.
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
      const before = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(cdPools(before.body)[0]).toMatchObject({ total: 2, used: 2, remaining: 0 });

      // Drop the cleric entry to level 2 and the XP to match (max(cleric@2→1, paladin@4→1) = 1,
      // down from 2). Clamp-on-read (buildResourcesPayload) must cap `used` to the
      // new total without any LEVEL_GATED_RECONCILERS entry (CLAUDE.md: derive, don't persist).
      await prisma.characterClassEntry.updateMany({
        where: { characterId: CHAR_ID, name: "cleric" },
        data: { level: 2 },
      });
      await prisma.character.update({ where: { id: CHAR_ID }, data: { experiencePoints: 6500 } });

      const after = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(after.status).toBe(200);
      expect(cdPools(after.body)[0]).toMatchObject({ total: 1, used: 1, remaining: 0 });
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
      expect(pools[0].remaining).toBe(2);
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
          experiencePoints: 64000, // level 10 (paladin 4 + cleric 6), no pending level-up
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

    it("still exactly one pool at total 2 — the max comes from the non-primary entry", async () => {
      const res = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(res.status).toBe(200);
      const pools = cdPools(res.body);
      expect(pools).toHaveLength(1);
      expect(pools[0].total).toBe(2);
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
          experiencePoints: 14000, // level 6
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

    it("has exactly one channelDivinity pool at total 2, same as before entry-scoping (#1315)", async () => {
      const res = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(res.status).toBe(200);
      const pools = cdPools(res.body);
      expect(pools).toHaveLength(1);
      expect(pools[0].total).toBe(2);
    });
  });
});
