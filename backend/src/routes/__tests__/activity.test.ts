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
 *   Inventory undo (Issue #117)
 *     - purchase undo (delete created row + refund currency)
 *     - full sell of a custom weapon (restore row + weapon detail + reverse currency)
 *     - remove undo (restore full row + detail)
 *     - adjust-to-zero (restore row) + partial adjust (restore quantity)
 *     - setEquipped undo (restore equipped flag)
 *     - bulk batch (sell + remove in one tx) restored atomically
 *     - LIFO guard still applies to inventory batches
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { ensureTestOwner } from "../../test-support/owner.js";

// ── Shared helpers ─────────────────────────────────────────────────────────────

const app = () => createApp();

const OWNER_ID = "owner-activity";

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
    await ensureTestOwner(OWNER_ID);
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
    await ensureTestOwner(OWNER_ID);
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
        ownerId: OWNER_ID,
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
// Inventory undo (Issue #117): inventory events restore deleted rows + detail
// rows from data.deletedItem and reverse currency from data.currencyDelta.
// ════════════════════════════════════════════════════════════════════════════

const INV_ID = "test-activity-inventory-1";
const INV_CATALOG_NAME = "Activity Revert Test Rogue";

describe("POST /:id/events/:batchId/revert — inventory undo", () => {
  let classId: string;

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: INV_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
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

  const inv = (operations: unknown[]) =>
    supertest(app()).post(`/api/characters/${INV_ID}/inventory/transactions`).send({ operations });

  const findItem = (body: { inventory: Array<{ name: string }> }, name: string) =>
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
    expect(acquire.body.currency).toEqual({ cp: 0, sp: 0, gp: 8, pp: 0 }); // 10 - 2

    const batchId = await latestBatchId(INV_ID);
    const res = await revert(INV_ID, batchId);
    expect(res.status).toBe(200);

    expect(findItem(res.body, "Bought Torch")).toBeUndefined(); // row deleted
    expect(res.body.currency).toEqual({ cp: 0, sp: 0, gp: 10, pp: 0 }); // refunded

    // The batch event is marked reverted and a meta `revert` event is appended.
    const events = await prisma.characterEvent.findMany({ where: { characterId: INV_ID, batchId } });
    expect(events.every((e) => e.reverted)).toBe(true);
    const timeline = await supertest(app()).get(`/api/characters/${INV_ID}/activity`);
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
    expect(findItem(sell.body, "Sellable Saber")).toBeUndefined(); // full stack sold → row gone
    expect(sell.body.currency).toEqual({ cp: 0, sp: 0, gp: 15, pp: 0 }); // 10 + 5

    const batchId = await latestBatchId(INV_ID);
    const res = await revert(INV_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.currency).toEqual({ cp: 0, sp: 0, gp: 10, pp: 0 }); // proceeds removed

    const restored = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { weaponDetail: true },
    });
    expect(restored).toMatchObject({
      id: itemId,
      name: "Sellable Saber",
      quantity: 2,
      equipped: true,
      notes: "heirloom",
      position: original.position,
    });
    expect(restored.weaponDetail).toMatchObject({
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

    const restored = await prisma.inventoryItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { armorDetail: true },
    });
    expect(restored.name).toBe("Removable Robe");
    expect(restored.armorDetail).toMatchObject({ armorCategory: "light", baseArmorClass: 11 });
  });

  it("undoes an adjust-to-zero (restores row) and a partial adjust (restores quantity)", async () => {
    const acquire = await inv([
      { type: "acquire", custom: { name: "Stack of Rations", category: "gear" }, quantity: 5 },
    ]);
    const itemId = findItem(acquire.body, "Stack of Rations")!.id as string;

    // Partial adjust 5 → 3, then undo → back to 5 (row survived).
    await inv([{ type: "adjustQuantity", inventoryItemId: itemId, delta: -2 }]);
    const partialBatch = await latestBatchId(INV_ID);
    await revert(INV_ID, partialBatch);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).quantity).toBe(5);

    // Adjust 5 → 0 (row deleted), then undo → row recreated at quantity 5.
    await inv([{ type: "adjustQuantity", inventoryItemId: itemId, delta: -5 }]);
    expect(await prisma.inventoryItem.findUnique({ where: { id: itemId } })).toBeNull();
    const zeroBatch = await latestBatchId(INV_ID);
    const res = await revert(INV_ID, zeroBatch);
    expect(res.status).toBe(200);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).quantity).toBe(5);
  });

  it("undoes a setEquipped, restoring the prior equipped flag", async () => {
    const acquire = await inv([
      { type: "acquire", custom: { name: "Plain Cloak", category: "gear" }, quantity: 1 },
    ]);
    const itemId = findItem(acquire.body, "Plain Cloak")!.id as string;

    await inv([{ type: "setEquipped", inventoryItemId: itemId, equipped: true }]);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).equipped).toBe(true);

    const batchId = await latestBatchId(INV_ID);
    await revert(INV_ID, batchId);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).equipped).toBe(false);
  });

  it("undoes a bulk batch (sell A + remove B in one tx), restoring both atomically", async () => {
    const acquire = await inv([
      { type: "acquire", custom: { name: "Bulk Item A", category: "gear" }, quantity: 1 },
      { type: "acquire", custom: { name: "Bulk Item B", category: "gear" }, quantity: 1 },
    ]);
    const idA = findItem(acquire.body, "Bulk Item A")!.id as string;
    const idB = findItem(acquire.body, "Bulk Item B")!.id as string;

    // One transaction: sell A (full) + remove B.
    const batch = await inv([
      { type: "sell", inventoryItemId: idA, currencyDelta: { cp: 0, sp: 0, gp: 1, pp: 0 } },
      { type: "remove", inventoryItemId: idB },
    ]);
    expect(batch.status).toBe(200);
    expect(findItem(batch.body, "Bulk Item A")).toBeUndefined();
    expect(findItem(batch.body, "Bulk Item B")).toBeUndefined();
    expect(batch.body.currency).toEqual({ cp: 0, sp: 0, gp: 11, pp: 0 }); // 10 + 1

    const batchId = await latestBatchId(INV_ID);
    const res = await revert(INV_ID, batchId);
    expect(res.status).toBe(200);

    expect(await prisma.inventoryItem.findUnique({ where: { id: idA } })).not.toBeNull();
    expect(await prisma.inventoryItem.findUnique({ where: { id: idB } })).not.toBeNull();
    expect(res.body.currency).toEqual({ cp: 0, sp: 0, gp: 10, pp: 0 }); // proceeds reversed
  });

  it("still enforces the LIFO guard (409 on an older inventory batch)", async () => {
    const acquire = await inv([
      { type: "acquire", custom: { name: "Old Lantern", category: "gear" }, quantity: 1 },
    ]);
    const oldBatch = await latestBatchId(INV_ID);
    const itemId = findItem(acquire.body, "Old Lantern")!.id as string;

    // A newer action makes the older batch un-undoable.
    await inv([{ type: "setEquipped", inventoryItemId: itemId, equipped: true }]);

    const res = await revert(INV_ID, oldBatch);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/most recent/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Level-up / level-down: the ONLY revert sub-branch that writes a class-entry
// level. The restore path (activity.ts) uses `event.data.primaryEntryId` +
// `before.classEntryLevel` to write CharacterClassEntry.level back. These
// scenarios exercise that branch end-to-end against persisted relational state.
//
// Fixture: a d10 Fighter sitting at exactly 900 XP (XP level 3) but with only
// ONE HP level-up applied (hitDice.total = 1, classEntry.level = 1). That
// pending-level gap lets us click a real `levelUp` op, then undo it.
// ════════════════════════════════════════════════════════════════════════════

const LVL_ID = "test-activity-leveling-1";
const LVL_CATALOG_NAME = "Activity Revert Test Leveler";

// 5e XP thresholds used below (levelForExperience): L2 = 300, L3 = 900.
const XP_LEVEL_3 = 900;
const XP_LEVEL_2 = 300;

const LVL_BASE = {
  id: LVL_ID,
  name: "Activity Test Leveler",
  alignment: "True Neutral",
  experiencePoints: XP_LEVEL_3, // derived level 3, but only 1 HP level-up applied
  armorClass: 16,
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 12, max: 12, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 1, die: "d10", spent: 0 }, // only level 1 applied → 2 pending
  abilityScores: {
    strength: 14,
    dexterity: 12,
    constitution: 14, // +2 mod → no impact on +0-mod scenarios; chosen for clean HP math
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
        // class entry starts at level 1 (snapshot name drives nothing level-relevant here)
        classEntries: { create: [{ name: "fighter", classId: levelClassId, position: 0, level: 1 }] },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: LVL_ID } });
  });

  // Reads the persisted CharacterClassEntry.level directly (the column the
  // revert branch writes) so the assertion is on real relational state, not a
  // derived/serialized value.
  async function persistedClassEntryLevel(): Promise<number> {
    const entry = await prisma.characterClassEntry.findFirst({
      where: { characterId: LVL_ID, position: 0 },
      select: { level: true },
    });
    if (!entry) throw new Error("class entry not found");
    return entry.level;
  }

  // ── levelUp: revert restores classEntry.level via primaryEntryId branch ────

  it("reverts a level-up, restoring the persisted CharacterClassEntry.level", async () => {
    // Sanity: fixture starts at class-entry level 1.
    expect(await persistedClassEntryLevel()).toBe(1);

    // Click a real level-up. XP already derives level 3 > hitDice.total 1, so
    // the op is valid; it bumps hitDice.total → 2 and classEntry.level → 2 and
    // writes a `levelUp` event carrying data.primaryEntryId + before.classEntryLevel.
    const levelUp = await supertest(app())
      .post(`/api/characters/${LVL_ID}/hp`)
      .send({ operations: [{ type: "levelUp", method: "average" }] });
    expect(levelUp.status).toBe(200);
    expect(levelUp.body.classes[0].level).toBe(2);
    expect(await persistedClassEntryLevel()).toBe(2);

    // Undo it. This is the ONLY revert code path that writes a class-entry
    // level — it reads data.primaryEntryId + before.classEntryLevel.
    const batchId = await latestBatchId(LVL_ID);
    const res = await revert(LVL_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.classes[0].level).toBe(1); // serialized view restored
    expect(await persistedClassEntryLevel()).toBe(1); // persisted column restored
  });

  // ── levelDown: XP set that lowers level emits a levelDown event whose revert
  //    branch also restores classEntry.level via the same primaryEntryId path. ─

  it("reverts an XP-driven level-down, restoring the lowered CharacterClassEntry.level", async () => {
    // First, apply two real level-ups so hitDice.total = 3 and classEntry.level = 3.
    const up1 = await supertest(app())
      .post(`/api/characters/${LVL_ID}/hp`)
      .send({ operations: [{ type: "levelUp", method: "average" }] });
    expect(up1.status).toBe(200);
    const up2 = await supertest(app())
      .post(`/api/characters/${LVL_ID}/hp`)
      .send({ operations: [{ type: "levelUp", method: "average" }] });
    expect(up2.status).toBe(200);
    expect(up2.body.classes[0].level).toBe(3);
    expect(await persistedClassEntryLevel()).toBe(3);

    // Now SET XP down to level 2. The experience handler auto-reverses the HP
    // level-ups (revertLevelUps) in the SAME batch, emitting a `levelDown`
    // event that snapshots before.classEntryLevel = 3 and data.primaryEntryId,
    // and writes classEntry.level down to 2.
    const down = await supertest(app())
      .post(`/api/characters/${LVL_ID}/experience`)
      .send({ operations: [{ type: "set", value: XP_LEVEL_2 }] });
    expect(down.status).toBe(200);
    expect(down.body.level).toBe(2);
    expect(down.body.classes[0].level).toBe(2);
    expect(await persistedClassEntryLevel()).toBe(2);

    // Undo the XP-set batch. The batch contains BOTH the experience event
    // (restores XP) and the levelDown event (restores classEntry.level via the
    // primaryEntryId branch). After undo, the entry level returns to 3.
    const batchId = await latestBatchId(LVL_ID);
    const res = await revert(LVL_ID, batchId);
    expect(res.status).toBe(200);
    expect(res.body.experiencePoints).toBe(XP_LEVEL_3); // XP restored
    expect(res.body.level).toBe(3); // derived level restored
    expect(res.body.classes[0].level).toBe(3); // serialized class-entry level restored
    expect(await persistedClassEntryLevel()).toBe(3); // persisted column restored
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /:id/activity — ?category= filter (issue #69)
//
// The filter is derived from the Prisma-generated CharacterEventCategory enum.
// Two behaviors are pinned here:
//   - a previously-missing-from-the-old-cast value (`conditions`) actually
//     filters (regression guard for the drifted union)
//   - an unknown category value is ignored (unfiltered), not a 400
// ════════════════════════════════════════════════════════════════════════════

const FILTER_ID = "test-activity-filter-1";
const FILTER_CATALOG_NAME = "Activity Filter Test Fighter";

describe("GET /:id/activity — ?category= filter", () => {
  let classId: string;

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: FILTER_CATALOG_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
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
        armorClass: 16,
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

    // Seed events in two different categories so a filter is observable:
    //   - one `conditions` event (the value missing from the old drifted cast)
    //   - one `hitPoints` event (damage)
    await supertest(app())
      .post(`/api/characters/${FILTER_ID}/conditions/transactions`)
      .send({ operations: [{ type: "applyCondition", key: "poisoned" }] });
    await supertest(app())
      .post(`/api/characters/${FILTER_ID}/hp`)
      .send({ operations: [{ type: "damage", amount: 3 }] });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FILTER_ID } });
  });

  it("?category=conditions returns ONLY conditions events (regression: was missing from the cast)", async () => {
    const res = await supertest(app()).get(`/api/characters/${FILTER_ID}/activity?category=conditions`);
    expect(res.status).toBe(200);
    const events = res.body as Array<{ category: string }>;
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.category === "conditions")).toBe(true);
    // The hitPoints damage event must be filtered out.
    expect(events.some((e) => e.category === "hitPoints")).toBe(false);
  });

  it("an unknown ?category value is ignored (returns unfiltered, no 400)", async () => {
    const res = await supertest(app()).get(`/api/characters/${FILTER_ID}/activity?category=not-a-real-category`);
    expect(res.status).toBe(200);
    const events = res.body as Array<{ category: string }>;
    // Unfiltered: both seeded domains are present.
    const categories = new Set(events.map((e) => e.category));
    expect(categories.has("conditions")).toBe(true);
    expect(categories.has("hitPoints")).toBe(true);
  });
});
