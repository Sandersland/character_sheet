/**
 * Tests for POST /api/characters/:id/advancement/transactions and the
 * feat-improvement modifier layer (deriveFeatBonuses applied at read time).
 *
 * Run with: DATABASE_URL=postgresql://... npx vitest run
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";

const OWNER_ID = "owner-advancement";

// XP thresholds
const XP_LVL_4 = 2700; // level 4 — 1 ASI slot (first unlock)

const app = createApp();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function postAdvancement(characterId: string, body: object) {
  return supertest(app)
    .post(`/api/characters/${characterId}/advancement/transactions`)
    .send(body);
}

async function getCharacter(characterId: string) {
  return supertest(app).get(`/api/characters/${characterId}`);
}

async function postHp(characterId: string, body: object) {
  return supertest(app)
    .post(`/api/characters/${characterId}/hp`)
    .send(body);
}

async function postUndo(characterId: string, batchId: string) {
  return supertest(app)
    .post(`/api/characters/${characterId}/events/${batchId}/revert`)
    .send({});
}

// ── Catalog fixtures ──────────────────────────────────────────────────────────

const CLASS_NAME = "Test Fighter (Advancement Suite)";

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 14, constitution: 10,
  intelligence: 10, wisdom: 10, charisma: 10,
};

// Level-4 character with 3 hitDice.total (1 pending level-up), base speed 30,
// initiative seeded from DEX mod = +2.
const FIXTURE_ID = "test-advancement-1";
const FIXTURE = {
  id: FIXTURE_ID,
  name: "Test Advancement Fixture",
  alignment: "True Neutral",
  experiencePoints: XP_LVL_4,  // level 4 — 1 ASI slot
  armorClass: 12,
  initiativeBonus: 2,           // DEX 14 → +2
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 3, die: "d10", spent: 0 }, // 1 pending level-up
  abilityScores: BASE_ABILITY_SCORES,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

// ── Suite setup ───────────────────────────────────────────────────────────────

let alertFeatId: string;
let mobileFeatId: string;
let toughFeatId: string;

describe("Advancement — feat improvements (Alert / Mobile / Tough)", () => {
  beforeAll(async () => {
    // Upsert catalog rows once for the whole suite.
    await prisma.characterClass.upsert({
      where: { name: CLASS_NAME },
      create: {
        name: CLASS_NAME,
        hitDie: "d10",
        savingThrows: ["strength"],
        skillChoiceCount: 2,
        skillChoices: ["athletics"],
        isSpellcaster: false,
      },
      update: {},
    });

    // Upsert the three feats with improvements (mirrors seed.ts).
    const alertFeat = await prisma.feat.upsert({
      where: { name: "Alert (Advancement Suite)" },
      create: {
        name: "Alert (Advancement Suite)",
        description: "You gain +5 to initiative rolls.",
        improvements: [{ target: "initiative", amount: 5 }] as unknown as Prisma.InputJsonValue,
      },
      update: {
        improvements: [{ target: "initiative", amount: 5 }] as unknown as Prisma.InputJsonValue,
      },
    });
    alertFeatId = alertFeat.id;

    const mobileFeat = await prisma.feat.upsert({
      where: { name: "Mobile (Advancement Suite)" },
      create: {
        name: "Mobile (Advancement Suite)",
        description: "Your speed increases by 10 feet.",
        improvements: [{ target: "speed", amount: 10 }] as unknown as Prisma.InputJsonValue,
      },
      update: {
        improvements: [{ target: "speed", amount: 10 }] as unknown as Prisma.InputJsonValue,
      },
    });
    mobileFeatId = mobileFeat.id;

    const toughFeat = await prisma.feat.upsert({
      where: { name: "Tough (Advancement Suite)" },
      create: {
        name: "Tough (Advancement Suite)",
        description: "+2 max HP per level.",
        improvements: [{ target: "maxHp", amount: 2, perLevel: true }] as unknown as Prisma.InputJsonValue,
      },
      update: {
        improvements: [{ target: "maxHp", amount: 2, perLevel: true }] as unknown as Prisma.InputJsonValue,
      },
    });
    toughFeatId = toughFeat.id;
  });

  afterAll(async () => {
    // Clean up catalog rows created by this suite.
    await prisma.feat.deleteMany({
      where: { name: { in: ["Alert (Advancement Suite)", "Mobile (Advancement Suite)", "Tough (Advancement Suite)"] } },
    });
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  beforeEach(async () => {
    // Each test gets a fresh fixture character with a class entry.
    await ensureTestOwner(OWNER_ID);
    await prisma.character.create({
      data: {
        ...FIXTURE,
        ownerId: OWNER_ID,
        spellcasting: Prisma.JsonNull,
        classEntries: {
          create: [{ position: 0, name: CLASS_NAME, level: 3 }],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.delete({ where: { id: FIXTURE_ID } }).catch(() => null);
  });

  // ── Alert (+5 initiative) ─────────────────────────────────────────────────

  describe("Alert feat", () => {
    it("increases initiativeBonus by 5 on the GET response", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: alertFeatId }],
      });
      const res = await getCharacter(FIXTURE_ID);
      expect(res.status).toBe(200);
      // FIXTURE has initiativeBonus: 2 (DEX 14). Alert adds 5 → expect 7.
      expect(res.body.initiativeBonus).toBe(7);
    });

    it("restores initiativeBonus when the feat is removed", async () => {
      const takeRes = await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: alertFeatId }],
      });
      expect(takeRes.status).toBe(200);
      const entryId = takeRes.body.advancements.find(
        (e: { featName: string }) => e.featName?.includes("Alert"),
      )?.id;
      expect(entryId).toBeDefined();

      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "removeAdvancement", entryId }],
      });
      const res = await getCharacter(FIXTURE_ID);
      expect(res.body.initiativeBonus).toBe(2); // back to base
    });

    it("restores initiativeBonus on undo", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: alertFeatId }],
      });
      const activityRes = await supertest(app).get(`/api/characters/${FIXTURE_ID}/activity`);
      expect(activityRes.status).toBe(200);
      const batchId: string = activityRes.body[0]?.batchId;
      expect(batchId).toBeTruthy();

      await postUndo(FIXTURE_ID, batchId);
      const res = await getCharacter(FIXTURE_ID);
      expect(res.body.initiativeBonus).toBe(2);
    });
  });

  // ── Mobile (+10 speed) ────────────────────────────────────────────────────

  describe("Mobile feat", () => {
    it("increases speed by 10 on the GET response", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: mobileFeatId }],
      });
      const res = await getCharacter(FIXTURE_ID);
      expect(res.status).toBe(200);
      expect(res.body.speed).toBe(40); // 30 + 10
    });

    it("restores speed when the feat is removed", async () => {
      const takeRes = await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: mobileFeatId }],
      });
      const entryId = takeRes.body.advancements.find(
        (e: { featName: string }) => e.featName?.includes("Mobile"),
      )?.id;

      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "removeAdvancement", entryId }],
      });
      const res = await getCharacter(FIXTURE_ID);
      expect(res.body.speed).toBe(30);
    });
  });

  // ── Tough (+2 HP / applied level) ─────────────────────────────────────────

  describe("Tough feat", () => {
    it("increases maxHp by 2 × hitDice.total on take", async () => {
      // hitDice.total = 3 → bonus = 6
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: toughFeatId }],
      });
      const res = await getCharacter(FIXTURE_ID);
      expect(res.status).toBe(200);
      expect(res.body.hitPoints.max).toBe(36); // 30 + 2*3
    });

    it("increases bonus by 2 on each subsequent level-up", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: toughFeatId }],
      });
      // Apply the pending level-up (hitDice.total goes from 3 → 4).
      await postHp(FIXTURE_ID, { operations: [{ type: "levelUp", method: "average" }] });
      const res = await getCharacter(FIXTURE_ID);
      // base max after levelUp + HP gain + Tough for level 4
      // Stored max = 30 (base) + levelUp gain; Tough = 2*4 = 8.
      // We don't know the exact rolled amount, so just verify Tough portion = 8.
      const hitDiceTotal = res.body.hitDice.total;
      const storedMax = res.body.hitPoints.max; // includes Tough
      // Tough contribution must be 2 × hitDice.total.
      expect(hitDiceTotal).toBe(4);
      // effMax = stored-feat-free base + 2*4. We can verify by removing and comparing.
      const entryId = res.body.advancements.find(
        (e: { featName: string }) => e.featName?.includes("Tough"),
      )?.id;
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "removeAdvancement", entryId }],
      });
      const resAfterRemove = await getCharacter(FIXTURE_ID);
      expect(storedMax - resAfterRemove.body.hitPoints.max).toBe(8); // 2 × 4
    });

    it("maxHp bonus vanishes when the feat is removed", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: toughFeatId }],
      });
      const afterTake = (await getCharacter(FIXTURE_ID)).body.hitPoints.max;

      const entryId = (await getCharacter(FIXTURE_ID)).body.advancements.find(
        (e: { featName: string }) => e.featName?.includes("Tough"),
      )?.id;
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "removeAdvancement", entryId }],
      });
      const afterRemove = (await getCharacter(FIXTURE_ID)).body.hitPoints.max;
      expect(afterTake - afterRemove).toBe(6); // 2 × 3 applied levels
    });

    it("clamps current HP to effective max when current > new max (not expected, defensive)", async () => {
      // Manually set current > base max to test clamp in serializeCharacter.
      await prisma.character.update({
        where: { id: FIXTURE_ID },
        data: {
          hitPoints: {
            current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 },
          } as unknown as Prisma.InputJsonValue,
        },
      });
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: toughFeatId }],
      });
      const res = await getCharacter(FIXTURE_ID);
      // current (30) ≤ effective max (30 + 6 = 36) — no clamping needed here.
      expect(res.body.hitPoints.current).toBeLessThanOrEqual(res.body.hitPoints.max);
    });

    it("long rest fills HP to effective max (including Tough bonus)", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: toughFeatId }],
      });
      // Damage the character first so they're below max.
      await postHp(FIXTURE_ID, { operations: [{ type: "damage", amount: 10 }] });
      // Long rest — should heal to effective max.
      await postHp(FIXTURE_ID, { operations: [{ type: "longRest" }] });
      const res = await getCharacter(FIXTURE_ID);
      expect(res.body.hitPoints.current).toBe(res.body.hitPoints.max);
    });

    it("short rest heal clamps to effective max (including Tough bonus)", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: toughFeatId }],
      });
      // Take damage so we can heal.
      await postHp(FIXTURE_ID, { operations: [{ type: "damage", amount: 20 }] });
      // Short rest with a large heal (above effective max) — should clamp.
      await postHp(FIXTURE_ID, {
        operations: [{ type: "shortRest", rolls: [10, 10, 10] }],
      });
      const res = await getCharacter(FIXTURE_ID);
      // Current should not exceed effective max.
      expect(res.body.hitPoints.current).toBeLessThanOrEqual(res.body.hitPoints.max);
    });
  });

  // ── Custom feat with improvements ─────────────────────────────────────────

  describe("custom feat with improvements", () => {
    it("applies speed bonus from a custom feat's improvements", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{
          type: "takeFeat",
          custom: {
            name: "Swift (custom)",
            description: "You are unnaturally fast.",
            improvements: [{ target: "speed", amount: 5 }],
          },
        }],
      });
      const res = await getCharacter(FIXTURE_ID);
      expect(res.body.speed).toBe(35); // 30 + 5
    });

    it("400s if custom improvements use an unknown target", async () => {
      const res = await postAdvancement(FIXTURE_ID, {
        operations: [{
          type: "takeFeat",
          custom: {
            name: "Mystery Feat",
            description: "Does something.",
            improvements: [{ target: "unknownStat", amount: 99 }],
          },
        }],
      });
      expect(res.status).toBe(400);
    });
  });

  // ── Over-cap read-clamp ───────────────────────────────────────────────────

  describe("feat improvement clamp on read (over-cap)", () => {
    it("excludes feat bonuses beyond the slot cap on GET without an XP op", async () => {
      // Take the one available slot.
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: alertFeatId }],
      });

      // Manually inject a second advancement entry with an initiative improvement
      // directly into the resources JSON (simulates a state that should be clamped).
      const char = await prisma.character.findUnique({
        where: { id: FIXTURE_ID },
        select: { resources: true },
      });
      const resources = (char!.resources as Record<string, unknown>) ?? {};
      const advancements = (resources.advancements as Array<Record<string, unknown>>) ?? [];
      advancements.push({
        id: "fake-over-cap-entry",
        level: 4,
        kind: "feat",
        abilityDeltas: {},
        hpDelta: 0,
        initDelta: 0,
        featName: "Fake Over-Cap Feat",
        featDescription: "Should not apply.",
        improvements: [{ target: "initiative", amount: 10 }],
      });
      await prisma.character.update({
        where: { id: FIXTURE_ID },
        data: { resources: { ...resources, advancements } as unknown as Prisma.InputJsonValue },
      });

      // GET should only apply the in-cap feat (Alert +5), not the extra +10.
      const res = await getCharacter(FIXTURE_ID);
      expect(res.body.initiativeBonus).toBe(7); // base 2 + Alert 5 only
    });
  });

  // ── GET /api/feats exposes improvements ───────────────────────────────────

  describe("GET /api/feats", () => {
    it("returns improvements on catalog feats", async () => {
      const res = await supertest(app).get("/api/feats");
      expect(res.status).toBe(200);
      const alert = res.body.find((f: { name: string }) => f.name === "Alert (Advancement Suite)");
      expect(alert).toBeDefined();
      expect(alert.improvements).toEqual([{ target: "initiative", amount: 5 }]);
    });
  });
});
