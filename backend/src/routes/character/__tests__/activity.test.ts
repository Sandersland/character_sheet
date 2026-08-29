import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
import { fighterResourceRowsData } from "@/test-support/fighter-resource-rows.js";
import { readInventorySnapshot } from "@/lib/inventory/inventory-snapshot-read.js";
import { startSoloSession } from "@/lib/session/sessions.js";

async function makeCampaign(ownerId: string): Promise<string> {
  const campaign = await prisma.campaign.create({
    data: { name: "Activity Test Campaign", ownerId, inviteCode: randomUUID() },
  });
  return campaign.id;
}

const OWNER_ID = "owner-activity";
let COOKIE: string;

async function latestBatchId(characterId: string): Promise<string> {
  const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${characterId}/activity`);
  expect(res.status).toBe(200);
  const events = res.body as Array<{ batchId?: string; type: string }>;
  const ev = events.find((e) => e.type !== "revert" && e.batchId);
  if (!ev?.batchId) throw new Error("no batchId found on the activity timeline");
  return ev.batchId;
}

function revert(characterId: string, batchId: string) {
  return supertest.agent(app).set("Cookie", COOKIE).post(`/api/characters/${characterId}/events/${batchId}/revert`).send();
}

const WIZARD_ID = "test-activity-wizard-1";
const WIZARD_CATALOG_NAME = "Activity Revert Test Wizard";

const WIZARD_BASE = {
  id: WIZARD_ID,
  name: "Activity Test Wizard",
  alignment: "Neutral Good",
  experiencePoints: 0,
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 8, max: 8, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 1, die: "d6", spent: 0 },
  abilityScores: {
    strength: 8,
    dexterity: 12,
    constitution: 12,
    intelligence: 16,
    wisdom: 10,
    charisma: 10,
  },
  savingThrowProficiencies: ["intelligence", "wisdom"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
};

const WIZARD_SPELLCASTING_JSON = {
  slotsUsed: {},
  spells: [
    {
      id: "fixture-spell-1",
      name: "Fixture Magic Missile",
      level: 1,
      school: "evocation",
      prepared: true,
      castingTime: "1 action",
      range: "120 ft",
      duration: "Instantaneous",
      description: "3d4+3 force damage, auto-hits.",
      effectKind: "damage",
      effectDiceCount: 3,
      effectDiceFaces: 4,
      effectModifier: 3,
      damageType: "force",
      upcastDicePerLevel: 1,
    },
  ],
};

describe("POST /:id/events/:batchId/revert — Wizard scenarios", () => {
  let wizardClassId: string;

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: WIZARD_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: WIZARD_CATALOG_NAME },
      create: {
        name: WIZARD_CATALOG_NAME,
        hitDie: "d6",
        savingThrows: ["intelligence", "wisdom"],
        skillChoiceCount: 2,
        skillChoices: ["arcana", "history"],
        isSpellcaster: true,
      },
      update: {},
    });
    wizardClassId = cls.id;

    await prisma.character.create({
      data: {
        ...WIZARD_BASE,
        ownerId: OWNER_ID,
        spellcasting: WIZARD_SPELLCASTING_JSON as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "wizard", classId: wizardClassId, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    // Character delete cascades to its CharacterEvent / Session rows.
    await prisma.character.deleteMany({ where: { id: WIZARD_ID } });
  });

  it("404s when the character does not exist", async () => {
    const res = await revert("does-not-exist", "any-batch");
    expect(res.status).toBe(404);
  });

  it("404s for an unknown batch id on a real character", async () => {
    const res = await revert(WIZARD_ID, "no-such-batch-id");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no events found/i);
  });

  it("409s when the batch has already been reverted", async () => {
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${WIZARD_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 3 }] });
    const batchId = await latestBatchId(WIZARD_ID);

    const first = await revert(WIZARD_ID, batchId);
    expect(first.status).toBe(200);

    const second = await revert(WIZARD_ID, batchId);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already been reverted/i);
  });

  it("409s when the batch is not the most-recent action (LIFO-only)", async () => {

    await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${WIZARD_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 2 }] });
    const firstBatch = await latestBatchId(WIZARD_ID);

    await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${WIZARD_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 1 }] });

    const res = await revert(WIZARD_ID, firstBatch);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/most recent/i);
  });

  it("409s when the batch belongs to an ENDED session (frozen history)", async () => {

    const campaignId = await makeCampaign(OWNER_ID);
    const session = await prisma.session.create({
      data: { campaignId, status: "ended", endedAt: new Date() },
    });
    const batchId = "ended-session-batch";
    await prisma.characterEvent.create({
      data: {
        characterId: WIZARD_ID,
        category: "hitPoints",
        type: "damage",
        summary: "Took 5 damage",
        before: { hitPoints: { current: 8, max: 8, temp: 0, deathSaves: { successes: 0, failures: 0 } } } as Prisma.InputJsonValue,
        after: { hitPoints: { current: 3, max: 8, temp: 0, deathSaves: { successes: 0, failures: 0 } } } as Prisma.InputJsonValue,
        actor: "player",
        reverted: false,
        batchId,
        sessionId: session.id,
      },
    });

    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(409);

    expect(res.body.error).toMatch(/most recent|completed session/i);
  });

  it("reverts an HP damage event, restoring before.hitPoints", async () => {
    const dmg = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${WIZARD_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 5 }] });
    expect(dmg.status).toBe(200);
    expect(dmg.body.hitPoints.current).toBe(3);

    const batchId = await latestBatchId(WIZARD_ID);
    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(8);
  });

  it("reverts an XP award, restoring experiencePoints AND derived level/proficiency", async () => {

    const award = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${WIZARD_ID}/experience`)
      .send({ operations: [{ type: "award", amount: 6500 }] });
    expect(award.status).toBe(200);
    expect(award.body.experiencePoints).toBe(6500);
    expect(award.body.level).toBe(5);
    expect(award.body.proficiencyBonus).toBe(3);

    const batchId = await latestBatchId(WIZARD_ID);
    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.experiencePoints).toBe(0);
    expect(res.body.level).toBe(1);
    expect(res.body.proficiencyBonus).toBe(2);
  });

  it("reverts a spell cast, restoring before.spellcasting slot usage", async () => {
    const cast = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${WIZARD_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 10 }] });
    expect(cast.status).toBe(200);
    const slotAfterCast = cast.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slotAfterCast.used).toBe(1);

    const batchId = await latestBatchId(WIZARD_ID);
    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);
    const slotAfterUndo = res.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slotAfterUndo.used).toBe(0);
  });

  it("reverts a long rest, re-expending BOTH spell slots and HP/hit-dice from one batch", async () => {
    const url = `/api/characters/${WIZARD_ID}/spellcasting/transactions`;

    await supertest.agent(app).set("Cookie", COOKIE).post(url).send({
      operations: [{
        type: "castSpell",
        entryId: "fixture-spell-1",
        slotLevel: 1,
        roll: 4,
        apply: { target: "self", kind: "damage", amount: 5 },
      }],
    });

    const rest = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${WIZARD_ID}/hp`)
      .send({ operations: [{ type: "longRest" }] });
    expect(rest.status).toBe(200);
    expect(rest.body.hitPoints.current).toBe(8);
    const slotAfterRest = rest.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slotAfterRest.used).toBe(0);

    const batchId = await latestBatchId(WIZARD_ID);
    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(3);
    const slotAfterUndo = res.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slotAfterUndo.used).toBe(1);
  });

  it("reverts a currency adjustment (PATCH currencyAdjust), restoring currency JSON", async () => {
    const patch = await supertest.agent(app).set("Cookie", COOKIE)
      .patch(`/api/characters/${WIZARD_ID}`)
      .send({ currency: { cp: 0, sp: 0, gp: 50, pp: 0 } });
    expect(patch.status).toBe(200);
    expect(patch.body.currency.gp).toBe(50);

    const batchId = await latestBatchId(WIZARD_ID);
    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.currency.gp).toBe(10);
  });

  it("appends a meta 'revert' event and marks the original events reverted:true", async () => {
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${WIZARD_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 4 }] });
    const batchId = await latestBatchId(WIZARD_ID);

    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);

    const reverted = await prisma.characterEvent.findMany({
      where: { characterId: WIZARD_ID, batchId },
    });
    expect(reverted.length).toBeGreaterThan(0);
    expect(reverted.every((e) => e.reverted)).toBe(true);

    const metas = await prisma.characterEvent.findMany({
      where: { characterId: WIZARD_ID, type: "revert" },
    });
    expect(metas).toHaveLength(1);
    expect(metas[0].batchId).toBeNull();
    expect(metas[0].reverted).toBe(false);
    expect(metas[0].data).toMatchObject({ revertedBatchId: batchId });
  });

  it("a revert of a multi-event batch restores all-or-nothing (HP + self-damage in one cast batch)", async () => {
    // A castSpell with self-damage produces a spellcasting event and a hitPoints event sharing one batchId.
    const cast = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${WIZARD_ID}/spellcasting/transactions`)
      .send({
        operations: [{
          type: "castSpell",
          entryId: "fixture-spell-1",
          slotLevel: 1,
          roll: 4,
          apply: { target: "self", kind: "damage", amount: 4 },
        }],
      });
    expect(cast.status).toBe(200);
    expect(cast.body.hitPoints.current).toBe(4);
    expect(cast.body.spellcasting.slots.find((s: { level: number }) => s.level === 1).used).toBe(1);

    const batchId = await latestBatchId(WIZARD_ID);

    const batchEvents = await prisma.characterEvent.findMany({
      where: { characterId: WIZARD_ID, batchId },
    });
    expect(batchEvents.length).toBeGreaterThanOrEqual(2);

    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);

    expect(res.body.hitPoints.current).toBe(8);
    expect(res.body.spellcasting.slots.find((s: { level: number }) => s.level === 1).used).toBe(0);
  });

  describe("standalone rolls as trivially-undoable batches (#1861)", () => {
    function weaponResolveOp(actionId = "twf-action-1") {
      return {
        type: "resolveAction" as const,
        actionId,
        source: "Dagger (off-hand)",
        cost: { kind: "bonus" as const },
        toHit: { faces: [15], kept: 15, nat20: false, bonus: 5, total: 20, verdict: "hit" as const },
        effect: { spec: "1d4+3", faces: [3], total: 6, type: "piercing", kind: "damage" as const, crit: false },
      };
    }

    function checkRollOp(source = "Athletics") {
      return {
        type: "logRoll" as const,
        kind: "check" as const,
        source,
        total: 14,
        ability: "strength",
        faces: [12],
      };
    }

    function postOps(op: Record<string, unknown>) {
      return supertest.agent(app).set("Cookie", COOKIE)
        .post(`/api/characters/${WIZARD_ID}/resolve-action/transactions`)
        .send({ operations: [op] });
    }

    it("a logRoll op writes a roll-category event that reverts cleanly on its own", async () => {
      await startSoloSession(WIZARD_ID);
      const res = await postOps(checkRollOp());
      expect(res.status).toBe(200);

      const batchId = await latestBatchId(WIZARD_ID);
      const event = await prisma.characterEvent.findFirst({ where: { characterId: WIZARD_ID, batchId } });
      expect(event?.category).toBe("roll");
      expect(event?.type).toBe("checkRoll");

      expect(event?.before).toBeNull();
      expect(event?.after).toBeNull();

      const revertRes = await revert(WIZARD_ID, batchId);
      expect(revertRes.status).toBe(200);
      const reverted = await prisma.characterEvent.findFirst({ where: { characterId: WIZARD_ID, batchId } });
      expect(reverted?.reverted).toBe(true);
    });

    it("a standalone roll is the most-recent batch and is undoable BEFORE the real batch under it (LIFO, no skip)", async () => {
      await startSoloSession(WIZARD_ID);

      const resolveRes = await postOps(weaponResolveOp("twf-action-2"));
      expect(resolveRes.status).toBe(200);
      const weaponBatch = await latestBatchId(WIZARD_ID);

      const rollRes = await postOps(checkRollOp("Perception"));
      expect(rollRes.status).toBe(200);
      const rollBatch = await latestBatchId(WIZARD_ID);
      expect(rollBatch).not.toBe(weaponBatch);

      const undoRoll = await revert(WIZARD_ID, rollBatch);
      expect(undoRoll.status).toBe(200);

      const undoWeapon = await revert(WIZARD_ID, weaponBatch);
      expect(undoWeapon.status).toBe(200);
    });

    it("undoing the newest real batch is clean when only OLDER standalone rolls precede it", async () => {
      await startSoloSession(WIZARD_ID);

      const rollRes = await postOps(checkRollOp("Insight"));
      expect(rollRes.status).toBe(200);

      const resolveRes = await postOps(weaponResolveOp("twf-action-3"));
      expect(resolveRes.status).toBe(200);
      const weaponBatch = await latestBatchId(WIZARD_ID);

      const undoWeapon = await revert(WIZARD_ID, weaponBatch);
      expect(undoWeapon.status).toBe(200);
    });
  });
});

const FIGHTER_ID = "test-activity-fighter-1";
const FIGHTER_CATALOG_NAME = "Activity Revert Test Fighter";
const SUBCLASS_NAME = "Activity Revert Test Battle Master";

const FIGHTER_BASE = {
  id: FIGHTER_ID,
  name: "Activity Test Fighter",
  alignment: "Lawful Neutral",
  rulesEdition: "EDITION_2014" as const,
  experiencePoints: 6500,
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 44, max: 44, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 5, die: "d10", spent: 0 },
  abilityScores: {
    strength: 16,
    dexterity: 14,
    constitution: 14,
    intelligence: 10,
    wisdom: 12,
    charisma: 8,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
};

describe("POST /:id/events/:batchId/revert — Fighter scenarios", () => {
  let fighterClassId: string;
  let subclassId: string;

  afterAll(async () => {
    // Subclass rows cascade-delete with the class.
    await prisma.subclass.deleteMany({ where: { name: SUBCLASS_NAME } });
    await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: FIGHTER_CATALOG_NAME },
      create: {
        name: FIGHTER_CATALOG_NAME,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics", "intimidation"],
        isSpellcaster: false,
        subclassLevel: 3,
      },
      update: {},
    });
    fighterClassId = cls.id;

    await prisma.classFeature.deleteMany({ where: { classId: fighterClassId } });
    await prisma.classFeature.createMany({ data: fighterResourceRowsData(fighterClassId) });

    const subclass = await upsertEditionRow(
      prisma.subclass,
      { classId: cls.id, name: SUBCLASS_NAME, edition: null },
      { classId: cls.id, name: SUBCLASS_NAME, description: "Test subclass.", slug: "fighter-activity-revert-test-battle-master" },
      {},
    );
    subclassId = subclass.id;

    await prisma.character.create({
      data: {
        ...FIGHTER_BASE,
        ownerId: OWNER_ID,

        classEntries: { create: [{ name: "fighter", classId: fighterClassId, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIGHTER_ID } });
  });

  it("reverts a subclass selection, restoring subclassId/subclass to null", async () => {
    const set = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIGHTER_ID}/class/transactions`)
      .send({ operations: [{ type: "setSubclass", subclassId }] });
    expect(set.status).toBe(200);
    expect(set.body.subclassId).toBe(subclassId);
    expect(set.body.subclass).toBe(SUBCLASS_NAME);

    const batchId = await latestBatchId(FIGHTER_ID);
    const res = await revert(FIGHTER_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.subclassId ?? null).toBeNull();
    expect(res.body.subclass ?? null).toBeNull();
  });

  it("reverts an ASI, restoring abilityScores, hitPoints, initiativeBonus AND resources", async () => {

    const asi = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIGHTER_ID}/advancement/transactions`)
      .send({ operations: [{ type: "takeAsi", increases: [{ ability: "constitution", amount: 2 }] }] });
    expect(asi.status).toBe(200);
    expect(asi.body.abilityScores.constitution).toBe(16);
    expect(asi.body.hitPoints.max).toBe(49);
    expect(asi.body.advancements).toHaveLength(1);

    const batchId = await latestBatchId(FIGHTER_ID);
    const res = await revert(FIGHTER_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.abilityScores.constitution).toBe(14);
    expect(res.body.hitPoints.max).toBe(44);
    expect(res.body.initiativeBonus).toBe(2);
    expect(res.body.advancements).toHaveLength(0);
  });

  it("reverts a DEX ASI, restoring initiativeBonus", async () => {

    const asi = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIGHTER_ID}/advancement/transactions`)
      .send({ operations: [{ type: "takeAsi", increases: [{ ability: "dexterity", amount: 2 }] }] });
    expect(asi.status).toBe(200);
    expect(asi.body.abilityScores.dexterity).toBe(16);
    expect(asi.body.initiativeBonus).toBe(3);

    const batchId = await latestBatchId(FIGHTER_ID);
    const res = await revert(FIGHTER_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.abilityScores.dexterity).toBe(14);
    expect(res.body.initiativeBonus).toBe(2);
  });

  it("reverts a spendResource, restoring resources pool used counts", async () => {

    const spend = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FIGHTER_ID}/resources/transactions`)
      .send({ operations: [{ type: "spendResource", key: "secondWind", amount: 1 }] });
    expect(spend.status).toBe(200);
    const poolAfterSpend = spend.body.resources.pools.find((p: { key: string }) => p.key === "secondWind");
    expect(poolAfterSpend.used).toBe(1);
    expect(poolAfterSpend.remaining).toBe(0);

    const batchId = await latestBatchId(FIGHTER_ID);
    const res = await revert(FIGHTER_ID, batchId);
    expect(res.status).toBe(200);
    const poolAfterUndo = res.body.resources.pools.find((p: { key: string }) => p.key === "secondWind");
    expect(poolAfterUndo.used).toBe(0);
    expect(poolAfterUndo.remaining).toBe(1);
  });
});

const INV_ID = "test-activity-inventory-1";
const INV_CATALOG_NAME = "Activity Revert Test Rogue";
const INV_CATALOG_ITEM_NAME = "Activity Revert Catalog Torch";

describe("POST /:id/events/:batchId/revert — inventory undo", () => {
  let classId: string;

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: INV_CATALOG_NAME } });

    await prisma.item.deleteMany({ where: { name: INV_CATALOG_ITEM_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: INV_CATALOG_NAME },
      create: {
        name: INV_CATALOG_NAME,
        hitDie: "d8",
        savingThrows: ["dexterity", "intelligence"],
        skillChoiceCount: 2,
        skillChoices: ["stealth", "acrobatics"],
        isSpellcaster: false,
      },
      update: {},
    });
    classId = cls.id;

    await prisma.character.create({
      data: {
        id: INV_ID,
        ownerId: OWNER_ID,
        name: "Activity Test Rogue",
        alignment: "Chaotic Good",
        experiencePoints: 0,
        initiativeBonus: 2,
        speed: 30,
        hitPoints: { current: 8, max: 8, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 1, die: "d8", spent: 0 },
        abilityScores: {
          strength: 10, dexterity: 16, constitution: 12,
          intelligence: 13, wisdom: 10, charisma: 12,
        },
        savingThrowProficiencies: ["dexterity", "intelligence"],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
        classEntries: { create: [{ name: "rogue", classId, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: INV_ID } });
  });

  const inv = (operations: unknown[]) =>
    supertest.agent(app).set("Cookie", COOKIE).post(`/api/characters/${INV_ID}/inventory/transactions`).send({ operations });

  const findItem = (body: { inventory: Array<{ name: string; id: string }> }, name: string) =>
    body.inventory.find((i) => i.name === name);

  it("undoes a purchase: deletes the created row AND refunds the currency", async () => {
    const acquire = await inv([
      {
        type: "acquire",
        custom: { name: "Bought Torch", category: "gear" },
        quantity: 1,
        currencyDelta: { cp: 0, sp: 0, gp: 2, pp: 0 },
      },
    ]);
    expect(acquire.status).toBe(200);
    expect(findItem(acquire.body, "Bought Torch")).toBeDefined();
    expect(acquire.body.currency).toEqual({ cp: 0, sp: 0, gp: 8, pp: 0 });

    const batchId = await latestBatchId(INV_ID);
    const res = await revert(INV_ID, batchId);
    expect(res.status).toBe(200);

    expect(findItem(res.body, "Bought Torch")).toBeUndefined();
    expect(res.body.currency).toEqual({ cp: 0, sp: 0, gp: 10, pp: 0 });

    const events = await prisma.characterEvent.findMany({ where: { characterId: INV_ID, batchId } });
    expect(events.every((e) => e.reverted)).toBe(true);
    const timeline = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${INV_ID}/activity`);
    expect((timeline.body as Array<{ type: string }>).some((e) => e.type === "revert")).toBe(true);
  });

  it("undoes a full sell of a custom weapon: restores the row + weapon detail + reverses currency", async () => {
    const acquire = await inv([
      {
        type: "acquire",
        custom: {
          name: "Sellable Saber",
          category: "weapon",
          weight: 3,
          description: "a fine blade",
          weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageType: "slashing", finesse: true },
        },
        quantity: 2,
        equipped: true,
        notes: "heirloom",
      },
    ]);
    expect(acquire.status).toBe(200);
    const itemId = findItem(acquire.body, "Sellable Saber")!.id as string;
    const original = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });

    const sell = await inv([
      { type: "sell", inventoryItemId: itemId, currencyDelta: { cp: 0, sp: 0, gp: 5, pp: 0 } },
    ]);
    expect(sell.status).toBe(200);
    expect(findItem(sell.body, "Sellable Saber")).toBeUndefined();
    expect(sell.body.currency).toEqual({ cp: 0, sp: 0, gp: 15, pp: 0 });

    const batchId = await latestBatchId(INV_ID);
    const res = await revert(INV_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.currency).toEqual({ cp: 0, sp: 0, gp: 10, pp: 0 });

    const restored = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(restored).toMatchObject({
      id: itemId,
      name: "Sellable Saber",
      quantity: 2,
      equippedSlot: "MAIN_HAND",
      notes: "heirloom",
      position: original.position,
    });

    expect(readInventorySnapshot(restored).weapon).toMatchObject({
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageType: "slashing",
      finesse: true,
    });
  });

  it("undoes a remove: restores the full row and its detail", async () => {
    const acquire = await inv([
      {
        type: "acquire",
        custom: {
          name: "Removable Robe",
          category: "armor",
          armor: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true },
        },
        quantity: 1,
      },
    ]);
    const itemId = findItem(acquire.body, "Removable Robe")!.id as string;

    await inv([{ type: "remove", inventoryItemId: itemId }]);
    expect(await prisma.inventoryItem.findUnique({ where: { id: itemId } })).toBeNull();

    const batchId = await latestBatchId(INV_ID);
    const res = await revert(INV_ID, batchId);
    expect(res.status).toBe(200);

    const restored = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(restored.name).toBe("Removable Robe");
    expect(readInventorySnapshot(restored).armor).toMatchObject({ armorCategory: "light", baseArmorClass: 11 });
  });

  it("undoes an adjust-to-zero (restores row) and a partial adjust (restores quantity)", async () => {
    const acquire = await inv([
      { type: "acquire", custom: { name: "Stack of Rations", category: "gear" }, quantity: 5 },
    ]);
    const itemId = findItem(acquire.body, "Stack of Rations")!.id as string;

    await inv([{ type: "adjustQuantity", inventoryItemId: itemId, delta: -2 }]);
    const partialBatch = await latestBatchId(INV_ID);
    await revert(INV_ID, partialBatch);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).quantity).toBe(5);

    await inv([{ type: "adjustQuantity", inventoryItemId: itemId, delta: -5 }]);
    expect(await prisma.inventoryItem.findUnique({ where: { id: itemId } })).toBeNull();
    const zeroBatch = await latestBatchId(INV_ID);
    const res = await revert(INV_ID, zeroBatch);
    expect(res.status).toBe(200);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).quantity).toBe(5);
  });

  it("undoes a setEquipped, restoring the prior equipped flag", async () => {
    const acquire = await inv([

      {
        type: "acquire",
        custom: {
          name: "Padded Armor",
          category: "armor",
          armor: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true },
        },
        quantity: 1,
      },
    ]);
    const itemId = findItem(acquire.body, "Padded Armor")!.id as string;

    await inv([{ type: "setEquipped", inventoryItemId: itemId, equipped: true }]);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).equippedSlot).toBe("BODY");

    const batchId = await latestBatchId(INV_ID);
    await revert(INV_ID, batchId);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).equippedSlot).toBeNull();
  });

  it("undoes a bulk batch (sell A + remove B in one tx), restoring both atomically", async () => {
    const acquire = await inv([
      { type: "acquire", custom: { name: "Bulk Item A", category: "gear" }, quantity: 1 },
      { type: "acquire", custom: { name: "Bulk Item B", category: "gear" }, quantity: 1 },
    ]);
    const idA = findItem(acquire.body, "Bulk Item A")!.id as string;
    const idB = findItem(acquire.body, "Bulk Item B")!.id as string;

    const batch = await inv([
      { type: "sell", inventoryItemId: idA, currencyDelta: { cp: 0, sp: 0, gp: 1, pp: 0 } },
      { type: "remove", inventoryItemId: idB },
    ]);
    expect(batch.status).toBe(200);
    expect(findItem(batch.body, "Bulk Item A")).toBeUndefined();
    expect(findItem(batch.body, "Bulk Item B")).toBeUndefined();
    expect(batch.body.currency).toEqual({ cp: 0, sp: 0, gp: 11, pp: 0 });

    const batchId = await latestBatchId(INV_ID);
    const res = await revert(INV_ID, batchId);
    expect(res.status).toBe(200);

    expect(await prisma.inventoryItem.findUnique({ where: { id: idA } })).not.toBeNull();
    expect(await prisma.inventoryItem.findUnique({ where: { id: idB } })).not.toBeNull();
    expect(res.body.currency).toEqual({ cp: 0, sp: 0, gp: 10, pp: 0 });
  });

  it("still enforces the LIFO guard (409 on an older inventory batch)", async () => {
    const acquire = await inv([

      {
        type: "acquire",
        custom: {
          name: "Spare Leathers",
          category: "armor",
          armor: { armorCategory: "light", baseArmorClass: 11, dexModifierApplies: true },
        },
        quantity: 1,
      },
    ]);
    const oldBatch = await latestBatchId(INV_ID);
    const itemId = findItem(acquire.body, "Spare Leathers")!.id as string;

    await inv([{ type: "setEquipped", inventoryItemId: itemId, equipped: true }]);

    const res = await revert(INV_ID, oldBatch);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/most recent/i);
  });

  it("409s (not 500) when undoing a sale whose proceeds were already spent, leaving rows + currency unchanged", async () => {

    const acquire = await inv([
      { type: "acquire", custom: { name: "Spent-Proceeds Dagger", category: "gear" }, quantity: 1 },
    ]);
    expect(acquire.status).toBe(200);
    const itemId = findItem(acquire.body, "Spent-Proceeds Dagger")!.id as string;

    const sell = await inv([
      { type: "sell", inventoryItemId: itemId, currencyDelta: { cp: 0, sp: 0, gp: 5, pp: 0 } },
    ]);
    expect(sell.status).toBe(200);
    expect(sell.body.currency).toEqual({ cp: 0, sp: 0, gp: 15, pp: 0 });
    expect(findItem(sell.body, "Spent-Proceeds Dagger")).toBeUndefined();

    await prisma.character.update({
      where: { id: INV_ID },
      data: { currency: { cp: 0, sp: 0, gp: 0, pp: 0 } },
    });

    const batchId = await latestBatchId(INV_ID);
    const res = await revert(INV_ID, batchId);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not enough currency/i);

    const after = await prisma.character.findUniqueOrThrow({ where: { id: INV_ID } });
    expect(after.currency).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
    expect(await prisma.inventoryItem.findUnique({ where: { id: itemId } })).toBeNull();

    const sellEvents = await prisma.characterEvent.findMany({ where: { characterId: INV_ID, batchId } });
    expect(sellEvents.length).toBeGreaterThan(0);
    expect(sellEvents.every((e) => !e.reverted)).toBe(true);
    const metas = await prisma.characterEvent.findMany({ where: { characterId: INV_ID, type: "revert" } });
    expect(metas).toHaveLength(0);
  });

  it("undoes a remove of a CATALOG item whose catalog row is gone → recreates with itemId:null (no FK error)", async () => {

    const catalogItem = await prisma.item.create({
      data: {
        name: INV_CATALOG_ITEM_NAME,
        category: "gear",
        scopeKey: "global",
        weight: 1,
        cost: { cp: 0, sp: 0, gp: 1, pp: 0 },
        description: "A bundled catalog torch.",
      },
    });

    const acquire = await inv([{ type: "acquire", itemId: catalogItem.id, quantity: 3 }]);
    expect(acquire.status).toBe(200);
    const acquired = findItem(acquire.body, INV_CATALOG_ITEM_NAME)!;
    const itemId = acquired.id as string;

    expect(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).itemId,
    ).toBe(catalogItem.id);

    await inv([{ type: "remove", inventoryItemId: itemId }]);
    expect(await prisma.inventoryItem.findUnique({ where: { id: itemId } })).toBeNull();
    await prisma.item.delete({ where: { id: catalogItem.id } });

    const batchId = await latestBatchId(INV_ID);
    const res = await revert(INV_ID, batchId);
    expect(res.status).toBe(200);

    const restored = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(restored.itemId).toBeNull();
    expect(restored.name).toBe(INV_CATALOG_ITEM_NAME);
    expect(restored.category).toBe("gear");
    expect(restored.quantity).toBe(3);
    expect(restored.weight).toBe(1);
  });
});

const LVL_ID = "test-activity-leveling-1";
const LVL_CATALOG_NAME = "Activity Revert Test Leveler";

const XP_LEVEL_3 = 900;
const XP_LEVEL_2 = 300;

const LVL_BASE = {
  id: LVL_ID,
  name: "Activity Test Leveler",
  alignment: "True Neutral",
  experiencePoints: XP_LEVEL_3, // derived level 3, but only 1 HP level-up applied
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 12, max: 12, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 1, die: "d10", spent: 0 },
  abilityScores: {
    strength: 14,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 10,
    charisma: 8,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
};

describe("POST /:id/events/:batchId/revert — level-up / level-down class-entry level", () => {
  let levelClassId: string;

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: LVL_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: LVL_CATALOG_NAME },
      create: {
        name: LVL_CATALOG_NAME,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics", "intimidation"],
        isSpellcaster: false,
      },
      update: {},
    });
    levelClassId = cls.id;

    await prisma.character.create({
      data: {
        ...LVL_BASE,
        ownerId: OWNER_ID,
        classEntries: { create: [{ name: "fighter", classId: levelClassId, position: 0, level: 1 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: LVL_ID } });
  });

  // Asserts on the persisted column directly, not the derived/serialized view.
  async function persistedClassEntryLevel(): Promise<number> {
    const entry = await prisma.characterClassEntry.findFirst({
      where: { characterId: LVL_ID, position: 0 },
      select: { level: true },
    });
    if (!entry) throw new Error("class entry not found");
    return entry.level;
  }

  it("reverts a level-up, restoring the persisted CharacterClassEntry.level", async () => {
    expect(await persistedClassEntryLevel()).toBe(1);

    const levelUp = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${LVL_ID}/hp`)
      .send({ operations: [{ type: "levelUp", method: "average" }] });
    expect(levelUp.status).toBe(200);
    expect(levelUp.body.classes[0].level).toBe(2);
    expect(await persistedClassEntryLevel()).toBe(2);

    // The only revert path that writes a class-entry level.
    const batchId = await latestBatchId(LVL_ID);
    const res = await revert(LVL_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.classes[0].level).toBe(1);
    expect(await persistedClassEntryLevel()).toBe(1);
  });

  it("reverts an XP-driven level-down, restoring the lowered CharacterClassEntry.level", async () => {
    const up1 = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${LVL_ID}/hp`)
      .send({ operations: [{ type: "levelUp", method: "average" }] });
    expect(up1.status).toBe(200);
    const up2 = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${LVL_ID}/hp`)
      .send({ operations: [{ type: "levelUp", method: "average" }] });
    expect(up2.status).toBe(200);
    expect(up2.body.classes[0].level).toBe(3);
    expect(await persistedClassEntryLevel()).toBe(3);

    const down = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${LVL_ID}/experience`)
      .send({ operations: [{ type: "set", value: XP_LEVEL_2 }] });
    expect(down.status).toBe(200);
    expect(down.body.level).toBe(2);
    expect(down.body.classes[0].level).toBe(2);
    expect(await persistedClassEntryLevel()).toBe(2);

    const batchId = await latestBatchId(LVL_ID);
    const res = await revert(LVL_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.experiencePoints).toBe(XP_LEVEL_3);
    expect(res.body.level).toBe(3);
    expect(res.body.classes[0].level).toBe(3);
    expect(await persistedClassEntryLevel()).toBe(3);
  });
});

const CONC_ID = "test-activity-concentration-1";
const CONC_CATALOG_NAME = "Activity Revert Test Concentrator";

const CONC_SPELLCASTING_JSON = {
  slotsUsed: {},
  spells: [
    {
      id: "fixture-conc-bless",
      name: "Fixture Bless",
      level: 1,
      school: "enchantment",
      prepared: true,
      castingTime: "1 action",
      range: "30 ft",
      duration: "Concentration, up to 1 minute",
      description: "Bless up to three creatures.",
      concentration: true,
    },
  ],
  concentratingOn: { entryId: "fixture-conc-bless", spellName: "Fixture Bless" },
};

describe("POST /:id/events/:batchId/revert — meta event labels the primary action (#320)", () => {
  let concClassId: string;

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CONC_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: CONC_CATALOG_NAME },
      create: {
        name: CONC_CATALOG_NAME,
        hitDie: "d6",
        savingThrows: ["intelligence", "wisdom"],
        skillChoiceCount: 2,
        skillChoices: ["arcana", "history"],
        isSpellcaster: true,
      },
      update: {},
    });
    concClassId = cls.id;

    await prisma.character.create({
      data: {
        id: CONC_ID,
        ownerId: OWNER_ID,
        name: "Activity Test Concentrator",
        alignment: "True Neutral",
        experiencePoints: 300,
        initiativeBonus: 1,
        speed: 30,
        hitPoints: { current: 200, max: 200, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 2, die: "d6", spent: 0 },
        abilityScores: {
          strength: 8, dexterity: 12, constitution: 10,
          intelligence: 16, wisdom: 10, charisma: 10,
        },
        savingThrowProficiencies: ["intelligence", "wisdom"],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
        spellcasting: CONC_SPELLCASTING_JSON as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "wizard", classId: concClassId, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: CONC_ID } });
  });

  it("labels the meta revert with the primary damage action, not the trailing concentration drop", async () => {

    const dmg = await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${CONC_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 150 }] });
    expect(dmg.status).toBe(200);
    expect(dmg.body.hitPoints.current).toBe(50);
    expect(dmg.body.concentrationChecks[0].held).toBe(false);

    const batchId = await latestBatchId(CONC_ID);
    const batchEvents = await prisma.characterEvent.findMany({
      where: { characterId: CONC_ID, batchId },
      orderBy: { createdAt: "asc" },
    });
    expect(batchEvents.map((e) => e.type)).toEqual(["damage", "concentrationDropped"]);

    const res = await revert(CONC_ID, batchId);
    expect(res.status).toBe(200);

    const meta = await prisma.characterEvent.findFirstOrThrow({
      where: { characterId: CONC_ID, type: "revert" },
    });
    expect(meta.category).toBe("hitPoints");
    expect(meta.summary).toMatch(/^Undid: Took 150 damage/);

    expect(meta.category).not.toBe("spellcasting");
    expect(meta.summary).not.toMatch(/Concentration/i);
  });
});

const FILTER_ID = "test-activity-filter-1";
const FILTER_CATALOG_NAME = "Activity Filter Test Fighter";

describe("GET /:id/activity — ?category= filter", () => {
  let classId: string;

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: FILTER_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: FILTER_CATALOG_NAME },
      create: {
        name: FILTER_CATALOG_NAME,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics", "intimidation"],
        isSpellcaster: false,
      },
      update: {},
    });
    classId = cls.id;

    await prisma.character.create({
      data: {
        id: FILTER_ID,
        ownerId: OWNER_ID,
        name: "Activity Filter Test Fighter",
        alignment: "Neutral Good",
        experiencePoints: 0,
        initiativeBonus: 1,
        speed: 30,
        hitPoints: { current: 12, max: 12, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 1, die: "d10", spent: 0 },
        abilityScores: {
          strength: 16, dexterity: 12, constitution: 14,
          intelligence: 10, wisdom: 10, charisma: 10,
        },
        savingThrowProficiencies: ["strength", "constitution"],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
        classEntries: { create: [{ name: "fighter", classId, position: 0 }] },
      },
    });

    await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FILTER_ID}/conditions/transactions`)
      .send({ operations: [{ type: "applyCondition", key: "poisoned" }] });
    await supertest.agent(app).set("Cookie", COOKIE)
      .post(`/api/characters/${FILTER_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 3 }] });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FILTER_ID } });
  });

  it("?category=conditions returns ONLY conditions events (regression: was missing from the cast)", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FILTER_ID}/activity?category=conditions`);
    expect(res.status).toBe(200);
    const events = res.body as Array<{ category: string }>;
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.category === "conditions")).toBe(true);

    expect(events.some((e) => e.category === "hitPoints")).toBe(false);
  });

  it("an unknown ?category value is ignored (returns unfiltered, no 400)", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FILTER_ID}/activity?category=not-a-real-category`);
    expect(res.status).toBe(200);
    const events = res.body as Array<{ category: string }>;

    const categories = new Set(events.map((e) => e.category));
    expect(categories.has("conditions")).toBe(true);
    expect(categories.has("hitPoints")).toBe(true);
  });
});

const TYPEFILTER_ID = "test-activity-typefilter-1";
const TYPEFILTER_NAME = "Activity Type Filter Fighter";

describe("GET /:id/activity — ?type= and ?sessionId= filters", () => {
  let classId: string;
  let sessionA: string;
  let sessionB: string;

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: TYPEFILTER_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: TYPEFILTER_NAME },
      create: {
        name: TYPEFILTER_NAME,
        hitDie: "d10",
        savingThrows: ["strength", "constitution"],
        skillChoiceCount: 2,
        skillChoices: ["athletics", "intimidation"],
        isSpellcaster: false,
      },
      update: {},
    });
    classId = cls.id;

    await prisma.character.create({
      data: {
        id: TYPEFILTER_ID,
        ownerId: OWNER_ID,
        name: TYPEFILTER_NAME,
        alignment: "Neutral Good",
        experiencePoints: 0,
        initiativeBonus: 1,
        speed: 30,
        hitPoints: { current: 12, max: 12, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 1, die: "d10", spent: 0 },
        abilityScores: {
          strength: 16, dexterity: 12, constitution: 14,
          intelligence: 10, wisdom: 10, charisma: 10,
        },
        savingThrowProficiencies: ["strength", "constitution"],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 10, pp: 0 },
        classEntries: { create: [{ name: "fighter", classId, position: 0 }] },
      },
    });

    const campaignId = await makeCampaign(OWNER_ID);
    const sA = await prisma.session.create({
      data: { campaignId, status: "ended", title: "Session A" },
    });
    const sB = await prisma.session.create({
      data: { campaignId, status: "ended", title: "Session B" },
    });
    sessionA = sA.id;
    sessionB = sB.id;

    await prisma.characterEvent.createMany({
      data: [
        {
          characterId: TYPEFILTER_ID,
          category: "inventory",
          type: "sold",
          summary: "Sold Shortsword ×1",
          sessionId: sessionA,
          batchId: "batch-sold",
        },
        {
          characterId: TYPEFILTER_ID,
          category: "inventory",
          type: "bought",
          summary: "Bought Longsword ×1",
          sessionId: sessionB,
          batchId: "batch-bought",
        },
        {
          characterId: TYPEFILTER_ID,
          category: "hitPoints",
          type: "damage",
          summary: "Took 3 damage",
          batchId: "batch-damage",
        },
      ],
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: TYPEFILTER_ID } });
  });

  it("?type=sold returns ONLY sold events", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${TYPEFILTER_ID}/activity?type=sold`);
    expect(res.status).toBe(200);
    const events = res.body as Array<{ type: string }>;
    expect(events.length).toBe(1);
    expect(events.every((e) => e.type === "sold")).toBe(true);
  });

  it("an unknown ?type value is ignored (returns unfiltered, no 400)", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${TYPEFILTER_ID}/activity?type=not-a-real-type`);
    expect(res.status).toBe(200);
    const events = res.body as Array<{ type: string }>;
    const types = new Set(events.map((e) => e.type));
    expect(types.has("sold")).toBe(true);
    expect(types.has("bought")).toBe(true);
    expect(types.has("damage")).toBe(true);
  });

  it("?sessionId= filters to events recorded during one session", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${TYPEFILTER_ID}/activity?sessionId=${sessionA}`);
    expect(res.status).toBe(200);
    const events = res.body as Array<{ type: string }>;
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("sold");
  });

  it("type + sessionId + category compose with AND semantics", async () => {

    const matched = await supertest.agent(app).set("Cookie", COOKIE).get(
      `/api/characters/${TYPEFILTER_ID}/activity?category=inventory&type=sold&sessionId=${sessionA}`,
    );
    expect(matched.status).toBe(200);
    expect((matched.body as unknown[]).length).toBe(1);

    const unmatched = await supertest.agent(app).set("Cookie", COOKIE).get(
      `/api/characters/${TYPEFILTER_ID}/activity?category=inventory&type=sold&sessionId=${sessionB}`,
    );
    expect(unmatched.status).toBe(200);
    expect((unmatched.body as unknown[]).length).toBe(0);
  });
});
