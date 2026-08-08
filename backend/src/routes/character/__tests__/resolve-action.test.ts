/**
 * resolveAction route integration tests (#1829, epic #1827 slice 2).
 * Mirrors spellcasting.test.ts: real Postgres in beforeEach, supertest
 * against the shared `app`. The fixture is a level-1 Wizard (2× L1 slots).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-resolve-action";
let COOKIE: string;

const FIXTURE_ID = "test-resolve-action-character-1";
const WIZARD_CATALOG_NAME = "Resolve Action Test Wizard";

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Resolve Action Test Wizard",
  alignment: "Neutral Good",
  experiencePoints: 0, // level 1 → 2 L1 slots
  initiativeBonus: 1,
  speed: 30,
  hitPoints: { current: 8, max: 8, temp: 0 },
  hitDice: { total: 1, die: "d6" },
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

const FIXTURE_SPELLCASTING_JSON = {
  slotsUsed: {},
  arcanumUsed: {},
  spells: [],
  concentratingOn: null,
};

// A cantrip/weapon resolution op — no slotLevel, so no server-side state
// delta (only the event itself is written).
function weaponOp(actionId = "action-1") {
  return {
    type: "resolveAction" as const,
    actionId,
    source: "Longbow",
    cost: { kind: "action" as const },
    toHit: { faces: [15], kept: 15, nat20: false, bonus: 5, total: 20, verdict: "hit" as const },
    effect: { spec: "1d8+3", faces: [6], total: 9, type: "piercing", kind: "damage" as const, crit: false },
  };
}

// A leveled-spell resolution op — spends one L1 slot.
function leveledCastOp(actionId = "action-2") {
  return {
    type: "resolveAction" as const,
    actionId,
    source: "Magic Missile",
    cost: { kind: "action" as const },
    effect: { spec: "3d4+3", faces: [2, 3, 4], total: 12, type: "force", kind: "damage" as const, crit: false },
    slotLevel: 1,
  };
}

// A no-roll utility cantrip (Prestidigitation) — every roll field is null and
// there is no slotLevel, so this exercises the all-nullable resolution shape.
function noRollOp(actionId = "action-3") {
  return {
    type: "resolveAction" as const,
    actionId,
    source: "Prestidigitation",
    cost: { kind: "action" as const },
    toHit: null,
    save: null,
    effect: null,
  };
}

function post(operations: unknown[]) {
  return supertest.agent(app).set("Cookie", COOKIE)
    .post(`/api/characters/${FIXTURE_ID}/resolve-action/transactions`)
    .send({ operations });
}

function activity(characterId: string) {
  return supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${characterId}/activity`);
}

function revert(characterId: string, batchId: string) {
  return supertest.agent(app).set("Cookie", COOKIE)
    .post(`/api/characters/${characterId}/events/${batchId}/revert`)
    .send();
}

describe("POST /api/characters/:id/resolve-action/transactions", () => {
  let wizardClassId: string;

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
        ...FIXTURE_BASE,
        ownerId: OWNER_ID,
        spellcasting: FIXTURE_SPELLCASTING_JSON as Prisma.InputJsonValue,
        classEntries: {
          create: [{ name: "wizard", classId: wizardClassId, position: 0 }],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
    await prisma.characterClass.deleteMany({ where: { name: WIZARD_CATALOG_NAME } });
  });

  // ── 404 / 400 guards ──────────────────────────────────────────────────────

  it("404s for an unknown character", async () => {
    const res = await supertest.agent(app).set("Cookie", COOKIE)
      .post("/api/characters/does-not-exist/resolve-action/transactions")
      .send({ operations: [weaponOp()] });
    expect(res.status).toBe(404);
  });

  it("400s on a missing required field (no source)", async () => {
    const res = await post([{ type: "resolveAction", actionId: "a1", cost: { kind: "action" } }]);
    expect(res.status).toBe(400);
  });

  it("400s on an invalid cost kind", async () => {
    const res = await post([{ ...weaponOp(), cost: { kind: "notARealCost" } }]);
    expect(res.status).toBe(400);
  });

  // ── toHit hardening (#1830 review: reject internally-inconsistent input) ──

  it("400s when nat20 doesn't match kept === 20", async () => {
    const op = weaponOp();
    const res = await post([{ ...op, toHit: { ...op.toHit, kept: 18, nat20: true } }]);
    expect(res.status).toBe(400);
  });

  it("400s when kept isn't one of the rolled faces", async () => {
    const op = weaponOp();
    const res = await post([{ ...op, toHit: { ...op.toHit, faces: [3, 8], kept: 15 } }]);
    expect(res.status).toBe(400);
  });

  it("400s when nat20 is true but verdict isn't crit", async () => {
    const op = weaponOp();
    const res = await post([
      { ...op, toHit: { ...op.toHit, faces: [20], kept: 20, nat20: true, verdict: "hit" } },
    ]);
    expect(res.status).toBe(400);
  });

  it("accepts a nat20 called as a crit", async () => {
    const op = weaponOp();
    const res = await post([
      { ...op, toHit: { ...op.toHit, faces: [20], kept: 20, nat20: true, verdict: "crit" } },
    ]);
    expect(res.status).toBe(200);
  });

  // ── decomposed components (#1830 review: accept + store for the drill-in) ─

  it("stores toHit.components and effect.components verbatim on the event", async () => {
    const op = weaponOp();
    const res = await post([
      {
        ...op,
        toHit: { ...op.toHit, components: { abilityMod: 3, proficiencyBonus: 2, rangedBonus: 0, attackRollBonus: 0, ability: "dexterity" } },
        effect: { ...op.effect, components: { abilityMod: 3, meleeDamageBonus: 0, ability: "dexterity" } },
      },
    ]);
    expect(res.status).toBe(200);

    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; data: Record<string, unknown> }>;
    const resolveEvent = events.find((e) => e.type === "resolveAction");
    const toHit = resolveEvent?.data.toHit as { components?: unknown };
    const effect = resolveEvent?.data.effect as { components?: unknown };
    expect(toHit.components).toEqual({ abilityMod: 3, proficiencyBonus: 2, rangedBonus: 0, attackRollBonus: 0, ability: "dexterity" });
    expect(effect.components).toEqual({ abilityMod: 3, meleeDamageBonus: 0, ability: "dexterity" });
  });

  it("400s on an invalid components object (unknown key)", async () => {
    const op = weaponOp();
    const res = await post([
      { ...op, toHit: { ...op.toHit, components: { abilityMod: 3, proficiencyBonus: 2, rangedBonus: 0, attackRollBonus: 0, notARealField: 1 } } },
    ]);
    expect(res.status).toBe(400);
  });

  // ── cantrip/weapon resolution (no state delta) ───────────────────────────

  it("a weapon resolution writes exactly one resolveAction event with no slots spent", async () => {
    const res = await post([weaponOp()]);
    expect(res.status).toBe(200);

    const slots = res.body.spellcasting.slots as Array<{ level: number; used: number }>;
    slots.forEach((s: { used: number }) => expect(s.used).toBe(0));

    const events = (await activity(FIXTURE_ID)).body as Array<{
      type: string; category: string; batchId?: string; data: Record<string, unknown>;
    }>;
    const resolveEvents = events.filter((e) => e.type === "resolveAction");
    expect(resolveEvents).toHaveLength(1);
    expect(resolveEvents[0].category).toBe("combat");
    expect(resolveEvents[0].data).toMatchObject({ actionId: "action-1", source: "Longbow", slotLevel: null });
    // No companion spellcasting/resources event rides this batch — one row per resolution.
    const sameBatch = events.filter((e) => e.batchId === resolveEvents[0].batchId);
    expect(sameBatch).toHaveLength(1);
  });

  it("undo of a weapon resolution reverts the event with no state to restore", async () => {
    await post([weaponOp()]);
    const beforeUndo = (await activity(FIXTURE_ID)).body as Array<{ type: string; batchId?: string }>;
    const batchId = beforeUndo.find((e) => e.type === "resolveAction")?.batchId;
    expect(batchId).toBeTruthy();

    const revertRes = await revert(FIXTURE_ID, batchId as string);
    expect(revertRes.status).toBe(200);

    const afterUndo = (await activity(FIXTURE_ID)).body as Array<{ type: string; reverted: boolean }>;
    const resolveEvent = afterUndo.find((e) => e.type === "resolveAction");
    expect(resolveEvent?.reverted).toBe(true);
  });

  // ── leveled spell resolution (spends a slot) ─────────────────────────────

  it("a leveled cast resolution spends exactly one slot and writes one resolveAction event", async () => {
    const res = await post([leveledCastOp()]);
    expect(res.status).toBe(200);

    const slots = res.body.spellcasting.slots as Array<{ level: number; total: number; used: number }>;
    const l1 = slots.find((s) => s.level === 1);
    expect(l1?.used).toBe(1);

    const events = (await activity(FIXTURE_ID)).body as Array<{
      type: string; category: string; batchId?: string;
    }>;
    const resolveEvents = events.filter((e) => e.type === "resolveAction");
    expect(resolveEvents).toHaveLength(1);
    const sameBatch = events.filter((e) => e.batchId === resolveEvents[0].batchId);
    expect(sameBatch).toHaveLength(1);
  });

  it("undo of a leveled cast resolution refunds the spent slot", async () => {
    await post([leveledCastOp()]);
    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; batchId?: string }>;
    const batchId = events.find((e) => e.type === "resolveAction")?.batchId;
    expect(batchId).toBeTruthy();

    const revertRes = await revert(FIXTURE_ID, batchId as string);
    expect(revertRes.status).toBe(200);

    const slots = revertRes.body.spellcasting.slots as Array<{ level: number; used: number }>;
    const l1 = slots.find((s) => s.level === 1);
    expect(l1?.used).toBe(0);
  });

  it("400s a leveled cast beyond available slots", async () => {
    await post([leveledCastOp("a1")]);
    await post([leveledCastOp("a2")]);
    // A level-1 wizard has exactly 2 L1 slots — the third cast must fail.
    const res = await post([leveledCastOp("a3")]);
    expect(res.status).toBe(400);
  });

  // ── no-roll resolution (all-nullable path, e.g. Prestidigitation) ────────

  it("a no-roll resolution writes exactly one event with before/after null", async () => {
    const res = await post([noRollOp()]);
    expect(res.status).toBe(200);

    const events = (await activity(FIXTURE_ID)).body as Array<{
      type: string; batchId?: string; before?: unknown; after?: unknown; data: Record<string, unknown>;
    }>;
    const resolveEvents = events.filter((e) => e.type === "resolveAction");
    expect(resolveEvents).toHaveLength(1);
    expect(resolveEvents[0].before ?? null).toBeNull();
    expect(resolveEvents[0].after ?? null).toBeNull();
    expect(resolveEvents[0].data).toMatchObject({
      actionId: "action-3",
      source: "Prestidigitation",
      toHit: null,
      save: null,
      effect: null,
      slotLevel: null,
    });
  });

  it("undo of a no-roll resolution reverts the event", async () => {
    await post([noRollOp()]);
    const beforeUndo = (await activity(FIXTURE_ID)).body as Array<{ type: string; batchId?: string }>;
    const batchId = beforeUndo.find((e) => e.type === "resolveAction")?.batchId;
    expect(batchId).toBeTruthy();

    const revertRes = await revert(FIXTURE_ID, batchId as string);
    expect(revertRes.status).toBe(200);

    const afterUndo = (await activity(FIXTURE_ID)).body as Array<{ type: string; reverted: boolean }>;
    const resolveEvent = afterUndo.find((e) => e.type === "resolveAction");
    expect(resolveEvent?.reverted).toBe(true);
  });
});
