/**
 * Activity-log revert (LIFO undo) integration tests.
 *
 * Covers the POST /api/characters/:id/events/:batchId/revert endpoint in
 * routes/activity.ts — the unified audit log's "undo last action" path. This
 * is core safety infrastructure and was previously untested.
 *
 * Mirrors spellcasting.test.ts: real Postgres in beforeEach, supertest against
 * createApp(). Uses UNIQUELY-NAMED catalog fixtures (per testing.md) so the
 * afterAll cleanup never touches seeded rows.
 *
 * What's exercised:
 *   Guards
 *     - 404 unknown batch
 *     - 409 already-reverted batch
 *     - 409 not-most-recent (LIFO-only)
 *     - 409 batch belongs to an ENDED session (frozen history)
 *   Per-category restore handlers
 *     - hitPoints (damage)            → hitPoints
 *     - experience (award)            → experiencePoints + derived level/prof
 *     - spellcasting (cast)           → slot usage
 *     - hitPoints rest                → spell slots AND resources together
 *     - class (setSubclass)           → subclassId/subclass
 *     - advancement (takeAsi)         → abilityScores/hitPoints/initiativeBonus/resources
 *     - resources (spendResource)     → resources.pools used counts
 *     - currency (PATCH currencyAdjust) → currency JSON
 *   Process invariants
 *     - multi-event batch reverts all-or-nothing
 *     - a meta "revert" event is appended
 *     - batch events are marked reverted:true
 *   Inventory deferral
 *     - inventory events are NOT reverted (limitation documented + locked)
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

// ── Shared helpers ─────────────────────────────────────────────────────────────

const app = () => createApp();

/**
 * Returns the batchId of the most-recent non-revert event for a character, by
 * reading the public activity timeline (desc order). This is exactly the batch
 * the LIFO endpoint expects to undo.
 */
async function latestBatchId(characterId: string): Promise<string> {
  const res = await supertest(app()).get(`/api/characters/${characterId}/activity`);
  expect(res.status).toBe(200);
  const events = res.body as Array<{ batchId?: string; type: string }>;
  const ev = events.find((e) => e.type !== "revert" && e.batchId);
  if (!ev?.batchId) throw new Error("no batchId found on the activity timeline");
  return ev.batchId;
}

function revert(characterId: string, batchId: string) {
  return supertest(app()).post(`/api/characters/${characterId}/events/${batchId}/revert`).send();
}

// ════════════════════════════════════════════════════════════════════════════
// Wizard-based scenarios: HP / XP / spellcasting / rest / currency / guards
// ════════════════════════════════════════════════════════════════════════════

const WIZARD_ID = "test-activity-wizard-1";
const WIZARD_CATALOG_NAME = "Activity Revert Test Wizard";

const WIZARD_BASE = {
  id: WIZARD_ID,
  name: "Activity Test Wizard",
  alignment: "Neutral Good",
  experiencePoints: 0, // level 1 → 2 L1 slots, prof +2
  armorClass: 12,
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
        spellcasting: WIZARD_SPELLCASTING_JSON as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "wizard", classId: wizardClassId, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    // Character delete cascades to its CharacterEvent / Session rows.
    await prisma.character.deleteMany({ where: { id: WIZARD_ID } });
  });

  // ── Guards ───────────────────────────────────────────────────────────────

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
    await supertest(app())
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
    // First action: damage. Capture its batch.
    await supertest(app())
      .post(`/api/characters/${WIZARD_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 2 }] });
    const firstBatch = await latestBatchId(WIZARD_ID);

    // Second action: another damage (now the most recent).
    await supertest(app())
      .post(`/api/characters/${WIZARD_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 1 }] });

    // Attempting to revert the older batch must be rejected.
    const res = await revert(WIZARD_ID, firstBatch);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/most recent/i);
  });

  it("409s when the batch belongs to an ENDED session (frozen history)", async () => {
    // Create an ended session and a damage event tagged with that sessionId.
    const session = await prisma.session.create({
      data: { characterId: WIZARD_ID, status: "ended", endedAt: new Date() },
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
    // The endpoint blocks ended-session events via the LIFO scan (they're
    // excluded from the "latest non-reverted" lookup), so the batch never
    // qualifies as the most-recent action.
    expect(res.body.error).toMatch(/most recent|completed session/i);
  });

  // ── Per-category: hitPoints ────────────────────────────────────────────────

  it("reverts an HP damage event, restoring before.hitPoints", async () => {
    const dmg = await supertest(app())
      .post(`/api/characters/${WIZARD_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 5 }] });
    expect(dmg.status).toBe(200);
    expect(dmg.body.hitPoints.current).toBe(3); // 8 → 3

    const batchId = await latestBatchId(WIZARD_ID);
    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(8); // restored
  });

  // ── Per-category: experience (derived level + proficiency recompute) ───────

  it("reverts an XP award, restoring experiencePoints AND derived level/proficiency", async () => {
    // Award enough XP to reach level 2 (300 XP) → prof bonus still +2,
    // but level changes 1 → 2. Undo must put both back.
    const award = await supertest(app())
      .post(`/api/characters/${WIZARD_ID}/experience`)
      .send({ operations: [{ type: "award", amount: 6500 }] }); // level 5
    expect(award.status).toBe(200);
    expect(award.body.experiencePoints).toBe(6500);
    expect(award.body.level).toBe(5);
    expect(award.body.proficiencyBonus).toBe(3); // L5 prof +3

    const batchId = await latestBatchId(WIZARD_ID);
    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.experiencePoints).toBe(0);
    expect(res.body.level).toBe(1);
    expect(res.body.proficiencyBonus).toBe(2); // derived back to L1 prof +2
  });

  // ── Per-category: spellcasting ─────────────────────────────────────────────

  it("reverts a spell cast, restoring before.spellcasting slot usage", async () => {
    const cast = await supertest(app())
      .post(`/api/characters/${WIZARD_ID}/spellcasting/transactions`)
      .send({ operations: [{ type: "castSpell", entryId: "fixture-spell-1", slotLevel: 1, roll: 10 }] });
    expect(cast.status).toBe(200);
    const slotAfterCast = cast.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slotAfterCast.used).toBe(1);

    const batchId = await latestBatchId(WIZARD_ID);
    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);
    const slotAfterUndo = res.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slotAfterUndo.used).toBe(0); // slot refunded
  });

  // ── Per-category: rest restores spell slots AND resources together ─────────

  it("reverts a long rest, re-expending BOTH spell slots and HP/hit-dice from one batch", async () => {
    const url = `/api/characters/${WIZARD_ID}/spellcasting/transactions`;

    // Spend a slot and take self-damage so the long rest has something to undo.
    await supertest(app()).post(url).send({
      operations: [{
        type: "castSpell",
        entryId: "fixture-spell-1",
        slotLevel: 1,
        roll: 4,
        apply: { target: "self", kind: "damage", amount: 5 }, // 8 → 3
      }],
    });

    // Long rest: restores HP to full and refreshes spell slots.
    const rest = await supertest(app())
      .post(`/api/characters/${WIZARD_ID}/hp`)
      .send({ operations: [{ type: "longRest" }] });
    expect(rest.status).toBe(200);
    expect(rest.body.hitPoints.current).toBe(8); // healed to full
    const slotAfterRest = rest.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slotAfterRest.used).toBe(0); // slot refreshed

    // Undo the long rest: HP should drop back to 3 and the slot should be spent again.
    const batchId = await latestBatchId(WIZARD_ID);
    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(3); // back to pre-rest HP
    const slotAfterUndo = res.body.spellcasting.slots.find((s: { level: number }) => s.level === 1);
    expect(slotAfterUndo.used).toBe(1); // slot re-expended (rest undone)
  });

  // ── Per-category: currency ─────────────────────────────────────────────────

  it("reverts a currency adjustment (PATCH currencyAdjust), restoring currency JSON", async () => {
    const patch = await supertest(app())
      .patch(`/api/characters/${WIZARD_ID}`)
      .send({ currency: { cp: 0, sp: 0, gp: 50, pp: 0 } });
    expect(patch.status).toBe(200);
    expect(patch.body.currency.gp).toBe(50);

    const batchId = await latestBatchId(WIZARD_ID);
    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.currency.gp).toBe(10); // restored to the fixture's starting gp
  });

  // ── Process invariants: meta event + reverted flags ────────────────────────

  it("appends a meta 'revert' event and marks the original events reverted:true", async () => {
    await supertest(app())
      .post(`/api/characters/${WIZARD_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 4 }] });
    const batchId = await latestBatchId(WIZARD_ID);

    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);

    // The original batch events are now flagged reverted.
    const reverted = await prisma.characterEvent.findMany({
      where: { characterId: WIZARD_ID, batchId },
    });
    expect(reverted.length).toBeGreaterThan(0);
    expect(reverted.every((e) => e.reverted)).toBe(true);

    // A meta "revert" event was appended (no batchId, not itself reverted).
    const metas = await prisma.characterEvent.findMany({
      where: { characterId: WIZARD_ID, type: "revert" },
    });
    expect(metas).toHaveLength(1);
    expect(metas[0].batchId).toBeNull();
    expect(metas[0].reverted).toBe(false);
    expect(metas[0].data).toMatchObject({ revertedBatchId: batchId });
  });

  it("a revert of a multi-event batch restores all-or-nothing (HP + self-damage in one cast batch)", async () => {
    // A single castSpell-with-self-damage batch produces two events
    // (spellcasting cast + hitPoints self-damage) sharing one batchId.
    const cast = await supertest(app())
      .post(`/api/characters/${WIZARD_ID}/spellcasting/transactions`)
      .send({
        operations: [{
          type: "castSpell",
          entryId: "fixture-spell-1",
          slotLevel: 1,
          roll: 4,
          apply: { target: "self", kind: "damage", amount: 4 }, // 8 → 4
        }],
      });
    expect(cast.status).toBe(200);
    expect(cast.body.hitPoints.current).toBe(4);
    expect(cast.body.spellcasting.slots.find((s: { level: number }) => s.level === 1).used).toBe(1);

    const batchId = await latestBatchId(WIZARD_ID);

    // Sanity: the batch really does contain more than one event.
    const batchEvents = await prisma.characterEvent.findMany({
      where: { characterId: WIZARD_ID, batchId },
    });
    expect(batchEvents.length).toBeGreaterThanOrEqual(2);

    const res = await revert(WIZARD_ID, batchId);
    expect(res.status).toBe(200);
    // Both the HP change and the slot spend are undone together.
    expect(res.body.hitPoints.current).toBe(8);
    expect(res.body.spellcasting.slots.find((s: { level: number }) => s.level === 1).used).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Fighter-based scenarios: subclass / advancement / resources
// A level-5 Fighter (6500 XP): has 1 advancement slot (L4), Second Wind pool,
// and qualifies for a Battle Master subclass at L3.
// ════════════════════════════════════════════════════════════════════════════

const FIGHTER_ID = "test-activity-fighter-1";
const FIGHTER_CATALOG_NAME = "Activity Revert Test Fighter";
const SUBCLASS_NAME = "Activity Revert Test Battle Master";

const FIGHTER_BASE = {
  id: FIGHTER_ID,
  name: "Activity Test Fighter",
  alignment: "Lawful Neutral",
  experiencePoints: 6500, // level 5 → 1 ASI slot (L4), prof +3
  armorClass: 16,
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
    // Subclass rows cascade-delete with the class, but delete explicitly for clarity.
    await prisma.subclass.deleteMany({ where: { name: SUBCLASS_NAME } });
    await prisma.characterClass.deleteMany({ where: { name: FIGHTER_CATALOG_NAME } });
  });

  beforeEach(async () => {
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

    const subclass = await prisma.subclass.upsert({
      where: { classId_name: { classId: cls.id, name: SUBCLASS_NAME } },
      create: { classId: cls.id, name: SUBCLASS_NAME, description: "Test subclass." },
      update: {},
    });
    subclassId = subclass.id;

    await prisma.character.create({
      data: {
        ...FIGHTER_BASE,
        // class entry snapshot name "fighter" → drives deriveResources / advancement slots
        classEntries: { create: [{ name: "fighter", classId: fighterClassId, position: 0 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIGHTER_ID } });
  });

  // ── Per-category: class (subclass selection) ───────────────────────────────

  it("reverts a subclass selection, restoring subclassId/subclass to null", async () => {
    const set = await supertest(app())
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

  // ── Per-category: advancement (ASI) ────────────────────────────────────────

  it("reverts an ASI, restoring abilityScores, hitPoints, initiativeBonus AND resources", async () => {
    // +2 CON: raises CON 14 → 16 (+1 mod → +5 max HP at 5 levels), and adds an
    // advancement entry to resources. Undo must restore all four.
    const asi = await supertest(app())
      .post(`/api/characters/${FIGHTER_ID}/advancement/transactions`)
      .send({ operations: [{ type: "takeAsi", increases: [{ ability: "constitution", amount: 2 }] }] });
    expect(asi.status).toBe(200);
    expect(asi.body.abilityScores.constitution).toBe(16);
    expect(asi.body.hitPoints.max).toBe(49); // 44 + 5 (CON +1 mod × 5 levels)
    expect(asi.body.advancements).toHaveLength(1);

    const batchId = await latestBatchId(FIGHTER_ID);
    const res = await revert(FIGHTER_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.abilityScores.constitution).toBe(14); // restored
    expect(res.body.hitPoints.max).toBe(44); // restored
    expect(res.body.initiativeBonus).toBe(2); // unchanged (CON, not DEX) but verified restored
    expect(res.body.advancements).toHaveLength(0); // advancement entry removed
  });

  it("reverts a DEX ASI, restoring initiativeBonus", async () => {
    // +2 DEX: 14 → 16 (+1 mod) bumps initiativeBonus by +1.
    const asi = await supertest(app())
      .post(`/api/characters/${FIGHTER_ID}/advancement/transactions`)
      .send({ operations: [{ type: "takeAsi", increases: [{ ability: "dexterity", amount: 2 }] }] });
    expect(asi.status).toBe(200);
    expect(asi.body.abilityScores.dexterity).toBe(16);
    expect(asi.body.initiativeBonus).toBe(3); // 2 + 1

    const batchId = await latestBatchId(FIGHTER_ID);
    const res = await revert(FIGHTER_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.abilityScores.dexterity).toBe(14);
    expect(res.body.initiativeBonus).toBe(2); // restored
  });

  // ── Per-category: resources (spendResource) ────────────────────────────────

  it("reverts a spendResource, restoring resources pool used counts", async () => {
    // Fighter base pool: Second Wind (1 use). Spend it, then undo.
    const spend = await supertest(app())
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
    expect(poolAfterUndo.used).toBe(0); // restored
    expect(poolAfterUndo.remaining).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Inventory deferral: inventory events are NOT reverted (documented limitation).
// ════════════════════════════════════════════════════════════════════════════

const INV_ID = "test-activity-inventory-1";
const INV_CATALOG_NAME = "Activity Revert Test Rogue";

describe("POST /:id/events/:batchId/revert — inventory deferral", () => {
  let classId: string;

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: INV_CATALOG_NAME } });
  });

  beforeEach(async () => {
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
        name: "Activity Test Rogue",
        alignment: "Chaotic Good",
        experiencePoints: 0,
        armorClass: 13,
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

  it("does NOT restore an acquired inventory item on revert (deferral asserted)", async () => {
    // Acquire a custom item — writes an inventory CharacterEvent.
    const acquire = await supertest(app())
      .post(`/api/characters/${INV_ID}/inventory/transactions`)
      .send({
        operations: [{
          type: "acquire",
          custom: { name: "Activity Test Torch", category: "gear" },
          quantity: 1,
        }],
      });
    expect(acquire.status).toBe(200);
    const itemBefore = acquire.body.inventory.find((i: { name: string }) => i.name === "Activity Test Torch");
    expect(itemBefore).toBeDefined();

    const batchId = await latestBatchId(INV_ID);
    const res = await revert(INV_ID, batchId);
    expect(res.status).toBe(200);

    // DOCUMENTED LIMITATION: inventory ops are explicitly skipped in undo, so
    // the acquired item is STILL present after the revert. The audit event is
    // marked reverted (timeline reflects the undo) but the relational row is not
    // removed.
    const itemAfter = res.body.inventory.find((i: { name: string }) => i.name === "Activity Test Torch");
    expect(itemAfter).toBeDefined(); // still here — inventory undo deferred

    // The batch event was still flagged reverted (process ran), confirming the
    // skip is in the per-category restore, not a refusal to process the batch.
    const events = await prisma.characterEvent.findMany({
      where: { characterId: INV_ID, batchId },
    });
    expect(events.every((e) => e.reverted)).toBe(true);
  });
});
