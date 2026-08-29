import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

const OWNER_ID = "owner-advancement";
let COOKIE: string;

const XP_LVL_4 = 2700;
// Keep in sync with XP_THRESHOLDS.
const XP_LVL_19 = 305000;

async function postAdvancement(characterId: string, body: object) {
  return supertest(app)
    .post(`/api/characters/${characterId}/advancement/transactions`)
    .set("Cookie", COOKIE)
    .send(body);
}

async function getCharacter(characterId: string) {
  return supertest(app).get(`/api/characters/${characterId}`).set("Cookie", COOKIE);
}

async function postHp(characterId: string, body: object) {
  return supertest(app)
    .post(`/api/characters/${characterId}/hp`)
    .set("Cookie", COOKIE)
    .send(body);
}

async function postUndo(characterId: string, batchId: string) {
  return supertest(app)
    .post(`/api/characters/${characterId}/events/${batchId}/revert`)
    .set("Cookie", COOKIE)
    .send({});
}

const CLASS_NAME = "Test Fighter (Advancement Suite)";

const BASE_ABILITY_SCORES = {
  strength: 10, dexterity: 14, constitution: 10,
  intelligence: 10, wisdom: 10, charisma: 10,
};

const FIXTURE_ID = "test-advancement-1";
const FIXTURE = {
  id: FIXTURE_ID,
  name: "Test Advancement Fixture",
  alignment: "True Neutral",
  experiencePoints: XP_LVL_4,
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  // hitDice.total trails XP-derived level 4 by one, leaving one pending level-up for tests to apply.
  hitDice: { total: 3, die: "d10", spent: 0 },
  abilityScores: BASE_ABILITY_SCORES,
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

let alertFeatId: string;
let mobileFeatId: string;
let toughFeatId: string;
let originFeatId: string;
let fightingStyleFeatId: string;
let epicBoonFeatId: string;

describe("Advancement — feat improvements (Alert / Mobile / Tough)", () => {
  beforeAll(async () => {
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

    const alertFeat = await upsertEditionRow(
      prisma.feat,
      { name: "Alert (Advancement Suite)", edition: null },
      {
        name: "Alert (Advancement Suite)",
        description: "You gain +5 to initiative rolls.",
        improvements: [{ target: "initiative", amount: 5 }] as unknown as Prisma.InputJsonValue,
      },
      { improvements: [{ target: "initiative", amount: 5 }] as unknown as Prisma.InputJsonValue },
    );
    alertFeatId = alertFeat.id;

    const mobileFeat = await upsertEditionRow(
      prisma.feat,
      { name: "Mobile (Advancement Suite)", edition: null },
      {
        name: "Mobile (Advancement Suite)",
        description: "Your speed increases by 10 feet.",
        improvements: [{ target: "speed", amount: 10 }] as unknown as Prisma.InputJsonValue,
      },
      { improvements: [{ target: "speed", amount: 10 }] as unknown as Prisma.InputJsonValue },
    );
    mobileFeatId = mobileFeat.id;

    const toughFeat = await upsertEditionRow(
      prisma.feat,
      { name: "Tough (Advancement Suite)", edition: null },
      {
        name: "Tough (Advancement Suite)",
        description: "+2 max HP per level.",
        improvements: [{ target: "maxHp", amount: 2, perLevel: true }] as unknown as Prisma.InputJsonValue,
      },
      { improvements: [{ target: "maxHp", amount: 2, perLevel: true }] as unknown as Prisma.InputJsonValue },
    );
    toughFeatId = toughFeat.id;

    // PHB'24: Origin/Fighting Style are never an ASI slot; Epic Boon requires level 19+ with a +1 cap of 30.
    const originFeat = await upsertEditionRow(
      prisma.feat,
      { name: "Origin Test Feat (Advancement Suite)", edition: null },
      { name: "Origin Test Feat (Advancement Suite)", description: "Origin.", category: "origin" },
      { category: "origin" },
    );
    originFeatId = originFeat.id;

    const fightingStyleFeat = await upsertEditionRow(
      prisma.feat,
      { name: "Fighting Style Test Feat (Advancement Suite)", edition: null },
      { name: "Fighting Style Test Feat (Advancement Suite)", description: "FS.", category: "fighting_style", prerequisite: "Fighting Style feature" },
      { category: "fighting_style" },
    );
    fightingStyleFeatId = fightingStyleFeat.id;

    const epicBoonFeat = await upsertEditionRow(
      prisma.feat,
      { name: "Boon Test Feat (Advancement Suite)", edition: null },
      {
        name: "Boon Test Feat (Advancement Suite)",
        description: "Epic Boon.",
        category: "epic_boon",
        levelPrerequisite: 19,
        abilityOptions: ["strength"],
        abilityIncrease: 1,
      },
      { category: "epic_boon", levelPrerequisite: 19, abilityOptions: ["strength"], abilityIncrease: 1 },
    );
    epicBoonFeatId = epicBoonFeat.id;

    // PHB'24: Alert models initiative as +proficiencyBonus via scaling.
    const scalingImprovements = [{ target: "initiative", amount: 1, scaling: "proficiencyBonus" }];
    await upsertEditionRow(
      prisma.feat,
      { name: "Scaling Test Feat (Advancement Suite)", edition: null },
      {
        name: "Scaling Test Feat (Advancement Suite)",
        description: "Initiative scales with PB.",
        category: "origin",
        improvements: scalingImprovements as unknown as Prisma.InputJsonValue,
      },
      { improvements: scalingImprovements as unknown as Prisma.InputJsonValue },
    );
  });

  afterAll(async () => {
    await prisma.feat.deleteMany({
      where: { name: { in: [
        "Alert (Advancement Suite)", "Mobile (Advancement Suite)", "Tough (Advancement Suite)",
        "Origin Test Feat (Advancement Suite)", "Fighting Style Test Feat (Advancement Suite)",
        "Boon Test Feat (Advancement Suite)", "Scaling Test Feat (Advancement Suite)",
      ] } },
    });
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
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

  describe("Alert feat", () => {
    it("increases initiativeBonus by 5 on the GET response", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: alertFeatId }],
      });
      const res = await getCharacter(FIXTURE_ID);
      expect(res.status).toBe(200);
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
      expect(res.body.initiativeBonus).toBe(2);
    });

    it("restores initiativeBonus on undo", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: alertFeatId }],
      });
      const activityRes = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}/activity`);
      expect(activityRes.status).toBe(200);
      const batchId: string = activityRes.body[0]?.batchId;
      expect(batchId).toBeTruthy();

      await postUndo(FIXTURE_ID, batchId);
      const res = await getCharacter(FIXTURE_ID);
      expect(res.body.initiativeBonus).toBe(2);
    });
  });

  describe("Mobile feat", () => {
    it("increases speed by 10 on the GET response", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: mobileFeatId }],
      });
      const res = await getCharacter(FIXTURE_ID);
      expect(res.status).toBe(200);
      expect(res.body.speed).toBe(40);
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

  describe("Tough feat", () => {
    it("increases maxHp by 2 × hitDice.total on take", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: toughFeatId }],
      });
      const res = await getCharacter(FIXTURE_ID);
      expect(res.status).toBe(200);
      expect(res.body.hitPoints.max).toBe(36);
    });

    it("increases bonus by 2 on each subsequent level-up", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: toughFeatId }],
      });
      await postHp(FIXTURE_ID, { operations: [{ type: "levelUp", method: "average" }] });
      const res = await getCharacter(FIXTURE_ID);
      // The rolled HP gain is random, so verify only the Tough contribution (2 × hitDice.total) by diffing before/after removal.
      const hitDiceTotal = res.body.hitDice.total;
      const storedMax = res.body.hitPoints.max;
      expect(hitDiceTotal).toBe(4);
      const entryId = res.body.advancements.find(
        (e: { featName: string }) => e.featName?.includes("Tough"),
      )?.id;
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "removeAdvancement", entryId }],
      });
      const resAfterRemove = await getCharacter(FIXTURE_ID);
      expect(storedMax - resAfterRemove.body.hitPoints.max).toBe(8);
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
      expect(afterTake - afterRemove).toBe(6);
    });

    it("clamps current HP to effective max when current > new max (not expected, defensive)", async () => {
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
      expect(res.body.hitPoints.current).toBeLessThanOrEqual(res.body.hitPoints.max);
    });

    it("long rest fills HP to effective max (including Tough bonus)", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: toughFeatId }],
      });
      await postHp(FIXTURE_ID, { operations: [{ type: "damage", amount: 10 }] });
      await postHp(FIXTURE_ID, { operations: [{ type: "longRest" }] });
      const res = await getCharacter(FIXTURE_ID);
      expect(res.body.hitPoints.current).toBe(res.body.hitPoints.max);
    });

    it("short rest heal clamps to effective max (including Tough bonus)", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: toughFeatId }],
      });
      await postHp(FIXTURE_ID, { operations: [{ type: "damage", amount: 20 }] });
      await postHp(FIXTURE_ID, {
        operations: [{ type: "shortRest", rolls: [10, 10, 10] }],
      });
      const res = await getCharacter(FIXTURE_ID);
      expect(res.body.hitPoints.current).toBeLessThanOrEqual(res.body.hitPoints.max);
    });
  });

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
      expect(res.body.speed).toBe(35);
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

  describe("feat improvement clamp on read (over-cap)", () => {
    it("excludes feat bonuses beyond the slot cap on GET without an XP op", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: alertFeatId }],
      });

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

      const res = await getCharacter(FIXTURE_ID);
      expect(res.body.initiativeBonus).toBe(7);
    });
  });

  // PHB'24 pp. 87-88
  describe("feat category gating", () => {
    it("400s taking an Origin feat via an ASI slot", async () => {
      const res = await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: originFeatId }],
      });
      expect(res.status).toBe(400);
    });

    it("400s taking a Fighting Style feat via an ASI slot", async () => {
      const res = await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: fightingStyleFeatId }],
      });
      expect(res.status).toBe(400);
    });

    it("allows a General feat at level 4", async () => {
      const res = await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: alertFeatId }],
      });
      expect(res.status).toBe(200);
    });

    it("400s an Epic Boon at level 4", async () => {
      const res = await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: epicBoonFeatId, abilityChoice: "strength" }],
      });
      expect(res.status).toBe(400);
    });

    it("allows an Epic Boon at level 19 and raises the ability past 20 (cap 30)", async () => {
      // Epic Boon's +1 is allowed past the normal ability cap of 20, up to its own cap of 30 — a takeAsi op would reject this.
      await prisma.character.update({
        where: { id: FIXTURE_ID },
        data: {
          experiencePoints: XP_LVL_19,
          abilityScores: { ...BASE_ABILITY_SCORES, strength: 20 } as unknown as Prisma.InputJsonValue,
        },
      });
      const res = await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: epicBoonFeatId, abilityChoice: "strength" }],
      });
      expect(res.status).toBe(200);
      const char = await getCharacter(FIXTURE_ID);
      expect(char.body.abilityScores.strength).toBe(21);
    });
  });

  describe("deleted catalog feat", () => {
    it("still serializes the stored featName and improvements after the catalog row is deleted", async () => {
      await postAdvancement(FIXTURE_ID, {
        operations: [{ type: "takeFeat", featId: mobileFeatId }],
      });
      await prisma.feat.delete({ where: { id: mobileFeatId } });

      const res = await getCharacter(FIXTURE_ID);
      expect(res.status).toBe(200);
      const entry = res.body.advancements.find((e: { featName?: string }) => e.featName?.includes("Mobile"));
      expect(entry).toBeDefined();
      expect(res.body.speed).toBe(40);

      const recreated = await prisma.feat.create({
        data: {
          name: "Mobile (Advancement Suite)",
          description: "Your speed increases by 10 feet.",
          improvements: [{ target: "speed", amount: 10 }] as unknown as Prisma.InputJsonValue,
        },
      });
      mobileFeatId = recreated.id;
    });
  });

  describe("GET /api/feats", () => {
    it("returns improvements on catalog feats", async () => {
      const res = await supertest.agent(app).set("Cookie", COOKIE).get("/api/feats?edition=EDITION_2024");
      expect(res.status).toBe(200);
      const alert = res.body.find((f: { name: string }) => f.name === "Alert (Advancement Suite)");
      expect(alert).toBeDefined();
      expect(alert.improvements).toEqual([{ target: "initiative", amount: 5 }]);
    });

    it("exposes category, levelPrerequisite, and repeatable", async () => {
      const res = await supertest.agent(app).set("Cookie", COOKIE).get("/api/feats?edition=EDITION_2024");
      const boon = res.body.find((f: { name: string }) => f.name === "Boon Test Feat (Advancement Suite)");
      expect(boon).toMatchObject({ category: "epic_boon", levelPrerequisite: 19, repeatable: false });
      const origin = res.body.find((f: { name: string }) => f.name === "Origin Test Feat (Advancement Suite)");
      expect(origin.category).toBe("origin");
      expect(origin.levelPrerequisite).toBeUndefined();
    });

    it("round-trips a scaling improvement (proficiencyBonus) unchanged", async () => {
      const res = await supertest.agent(app).set("Cookie", COOKIE).get("/api/feats?edition=EDITION_2024");
      const scaling = res.body.find((f: { name: string }) => f.name === "Scaling Test Feat (Advancement Suite)");
      expect(scaling.improvements).toEqual([{ target: "initiative", amount: 1, scaling: "proficiencyBonus" }]);
    });
  });
});

// The fightingStyle slot is a separate channel from the ASI slot cap (#1137).
describe("Advancement — Fighting Style feat slot (#1137)", () => {
  const XP_LVL_3 = 900;
  const FS_ID = "test-adv-fs-1";
  let fsDefenseId: string;
  let generalId: string;
  // The fs-slot cap resolves via CharacterClass.fightingStyleFeatLevel through the class FK — fixtures must link classId to real seeded rows or the slot cap is 0.
  let fighterClassId: string;
  let paladinClassId: string;

  beforeAll(async () => {
    fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" }, select: { id: true } })).id;
    paladinClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Paladin" }, select: { id: true } })).id;
    const defense = await upsertEditionRow(
      prisma.feat,
      { name: "Defense (FS Suite)", edition: null },
      {
        name: "Defense (FS Suite)",
        description: "+1 AC while armored.",
        category: "fighting_style",
        prerequisite: "Fighting Style feature",
        improvements: [{ target: "armorClassWhileArmored", amount: 1 }] as unknown as Prisma.InputJsonValue,
      },
      { category: "fighting_style", improvements: [{ target: "armorClassWhileArmored", amount: 1 }] as unknown as Prisma.InputJsonValue },
    );
    fsDefenseId = defense.id;
    const general = await upsertEditionRow(
      prisma.feat,
      { name: "General (FS Suite)", edition: null },
      { name: "General (FS Suite)", description: "General feat.", category: "general", levelPrerequisite: 4 },
      { category: "general", levelPrerequisite: 4, abilityOptions: [], abilityIncrease: 0 },
    );
    generalId = general.id;
  });

  afterAll(async () => {
    await prisma.feat.deleteMany({ where: { name: { in: ["Defense (FS Suite)", "General (FS Suite)"] } } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: { in: [FS_ID, "test-adv-fs-mc"] } } });
  });

  async function createFighter(level: number, xp: number) {
    await prisma.character.create({
      data: {
        ...FIXTURE, id: FS_ID, ownerId: OWNER_ID, experiencePoints: xp,
        hitDice: { total: level, die: "d10", spent: 0 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ position: 0, name: "Fighter", classId: fighterClassId, level }] },
      },
    });
  }

  it("Fighter takes a Fighting Style feat via the fightingStyle slot", async () => {
    await createFighter(4, XP_LVL_4);
    const res = await postAdvancement(FS_ID, {
      operations: [{ type: "takeFeat", featId: fsDefenseId, slot: "fightingStyle" }],
    });
    expect(res.status).toBe(200);
    const char = (await getCharacter(FS_ID)).body;
    const fsEntry = char.advancements.find((a: { featName?: string }) => a.featName === "Defense (FS Suite)");
    expect(fsEntry).toBeDefined();
    expect(fsEntry.slot).toBe("fightingStyle");
    expect(char.advancementSlots.used).toBe(0);
  });

  it("a Wizard cannot take a Fighting Style feat slot", async () => {
    await prisma.character.create({
      data: {
        ...FIXTURE, id: FS_ID, ownerId: OWNER_ID, experiencePoints: XP_LVL_4,
        hitDice: { total: 4, die: "d6", spent: 0 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ position: 0, name: "Wizard", level: 4 }] },
      },
    });
    const res = await postAdvancement(FS_ID, {
      operations: [{ type: "takeFeat", featId: fsDefenseId, slot: "fightingStyle" }],
    });
    expect(res.status).toBe(400);
  });

  it("a General feat cannot be taken via the fightingStyle slot", async () => {
    await createFighter(4, XP_LVL_4);
    const res = await postAdvancement(FS_ID, {
      operations: [{ type: "takeFeat", featId: generalId, slot: "fightingStyle" }],
    });
    expect(res.status).toBe(400);
  });

  it("a Fighting Style feat cannot be taken via the ASI slot (no slot tag)", async () => {
    await createFighter(4, XP_LVL_4);
    const res = await postAdvancement(FS_ID, {
      operations: [{ type: "takeFeat", featId: fsDefenseId }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate Fighting Style feat", async () => {
    // Fighter 1 / Paladin 2 gives two fs slots, so the failure here is dedup, not slot exhaustion.
    await prisma.character.create({
      data: {
        ...FIXTURE, id: "test-adv-fs-mc", ownerId: OWNER_ID, experiencePoints: XP_LVL_3,
        hitDice: { total: 3, die: "d10", spent: 0 },
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [
          { position: 0, name: "Fighter", classId: fighterClassId, level: 1 },
          { position: 1, name: "Paladin", classId: paladinClassId, level: 2 },
        ] },
      },
    });
    const first = await postAdvancement("test-adv-fs-mc", {
      operations: [{ type: "takeFeat", featId: fsDefenseId, slot: "fightingStyle" }],
    });
    expect(first.status).toBe(200);
    const dup = await postAdvancement("test-adv-fs-mc", {
      operations: [{ type: "takeFeat", featId: fsDefenseId, slot: "fightingStyle" }],
    });
    expect(dup.status).toBe(400);
  });

  it("holds a Fighting Style feat AND an ASI-slot feat without either consuming the other's slot", async () => {
    await createFighter(4, XP_LVL_4);
    const res = await postAdvancement(FS_ID, {
      operations: [
        { type: "takeFeat", featId: fsDefenseId, slot: "fightingStyle" },
        { type: "takeFeat", featId: generalId },
      ],
    });
    expect(res.status).toBe(200);
    const char = (await getCharacter(FS_ID)).body;
    expect(char.advancementSlots.used).toBe(1);
    const fsEntry = char.advancements.find((a: { slot?: string }) => a.slot === "fightingStyle");
    expect(fsEntry.featName).toBe("Defense (FS Suite)");
  });
});
