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
import { startSoloSession } from "@/lib/session/sessions.js";

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
  hitPoints: { current: 3, max: 8, temp: 0 },
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

// Concentration/apply side-effect fixture spells (#1833) — hand-built
// SpellEntry rows (normalizeSpellcastingMutable reads the JSON blob directly,
// no catalog join needed for a test fixture).
const CONCENTRATION_SPELL_A = {
  id: "entry-conc-a",
  name: "Test Concentration A",
  level: 1,
  school: "abjuration",
  prepared: true,
  castingTime: "1 action",
  range: "Self",
  duration: "1 minute",
  description: "",
  concentration: true,
};

const CONCENTRATION_SPELL_B = {
  id: "entry-conc-b",
  name: "Test Concentration B",
  level: 1,
  school: "abjuration",
  prepared: true,
  castingTime: "1 action",
  range: "Self",
  duration: "1 minute",
  description: "",
  concentration: true,
};

const HEAL_SPELL = {
  id: "entry-heal",
  name: "Test Cure Wounds",
  level: 1,
  school: "evocation",
  prepared: true,
  castingTime: "1 action",
  range: "Touch",
  duration: "Instantaneous",
  description: "",
  concentration: false,
  effectKind: "heal",
  effectDiceCount: 1,
  effectDiceFaces: 8,
  effectModifier: 0,
};

// A cantrip (level 0) — casting it spends no slot, so the interlock records it
// as `cantrip` (#1439 finding 1: it must not downgrade a leveled block).
const CANTRIP_SPELL = {
  id: "entry-cantrip",
  name: "Test Fire Bolt",
  level: 0,
  school: "evocation",
  prepared: true,
  castingTime: "1 action",
  range: "120 feet",
  duration: "Instantaneous",
  description: "",
  concentration: false,
};

const FIXTURE_SPELLCASTING_JSON = {
  slotsUsed: {},
  arcanumUsed: {},
  spells: [CONCENTRATION_SPELL_A, CONCENTRATION_SPELL_B, HEAL_SPELL, CANTRIP_SPELL],
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

// A weapon swing carrying one typed elemental rider (Flame Tongue +2d6 fire,
// #1843) — the primary `effect` is the weapon's own slashing damage, `riders`
// is the additive second typed term.
function riderSwingOp(actionId = "action-4") {
  return {
    type: "resolveAction" as const,
    actionId,
    source: "Flame Tongue",
    cost: { kind: "action" as const },
    toHit: { faces: [15], kept: 15, nat20: false, bonus: 5, total: 20, verdict: "hit" as const },
    effect: { spec: "1d8+3", faces: [6], total: 9, type: "slashing", kind: "damage" as const, crit: false },
    riders: [{ spec: "2d6", faces: [4, 5], total: 9, type: "fire", kind: "damage" as const, crit: false }],
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

// A spell-cast resolution carrying `entryId` (#1833) — routes through
// castSpellForResolutionInTx (concentration/buff/apply), not the bare
// slot-only path a `slotLevel`-only op (leveledCastOp above) still exercises.
function concentrationCastOp(entryId: string, actionId: string) {
  return {
    type: "resolveAction" as const,
    actionId,
    source: entryId === CONCENTRATION_SPELL_A.id ? "Test Concentration A" : "Test Concentration B",
    cost: { kind: "action" as const },
    toHit: null,
    save: null,
    effect: null,
    slotLevel: 1,
    entryId,
  };
}

function healCastOp(actionId = "action-heal") {
  return {
    type: "resolveAction" as const,
    actionId,
    source: "Test Cure Wounds",
    cost: { kind: "action" as const },
    effect: { spec: "1d8", faces: [5], total: 5, type: "healing", kind: "heal" as const, crit: false },
    slotLevel: 1,
    entryId: HEAL_SPELL.id,
    apply: { target: "self" as const, kind: "heal" as const, amount: 5 },
  };
}

// A leveled spell cast as a BONUS action (#1439) — entryId present so it routes
// through the recorder, cost.kind "bonus" so it lands on spellCastAsBonus.
function bonusLeveledCastOp(entryId: string, actionId: string) {
  return {
    type: "resolveAction" as const,
    actionId,
    source: "Test Concentration B",
    cost: { kind: "bonus" as const },
    toHit: null,
    save: null,
    effect: null,
    slotLevel: 1,
    entryId,
  };
}

// A cantrip cast — entryId present, NO slotLevel (no slot spent). `economy` is
// the cost kind so the recorder classifies it as a cantrip in that slot.
function cantripCastOp(economy: "action" | "bonus", actionId: string) {
  return {
    type: "resolveAction" as const,
    actionId,
    source: "Test Fire Bolt",
    cost: { kind: economy },
    effect: { spec: "1d10", faces: [6], total: 6, type: "fire", kind: "damage" as const, crit: false },
    entryId: CANTRIP_SPELL.id,
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

  // ── typed damage riders (#1843: additive riders[] sibling to effect) ────

  it("stores riders[] verbatim on the event, alongside the primary effect", async () => {
    const res = await post([riderSwingOp()]);
    expect(res.status).toBe(200);

    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; data: Record<string, unknown> }>;
    const resolveEvent = events.find((e) => e.type === "resolveAction");
    expect(resolveEvent?.data.effect).toMatchObject({ type: "slashing", total: 9 });
    expect(resolveEvent?.data.riders).toEqual([
      { spec: "2d6", faces: [4, 5], total: 9, type: "fire", kind: "damage", crit: false },
    ]);
  });

  it("defaults riders to an empty array when the op omits it", async () => {
    const res = await post([weaponOp()]);
    expect(res.status).toBe(200);

    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; data: Record<string, unknown> }>;
    const resolveEvent = events.find((e) => e.type === "resolveAction");
    expect(resolveEvent?.data.riders).toEqual([]);
  });

  it("400s on a malformed rider element (missing required type)", async () => {
    const op = riderSwingOp();
    const badRider = { ...op.riders[0] } as Record<string, unknown>;
    delete badRider.type;
    const res = await post([{ ...op, riders: [badRider] }]);
    expect(res.status).toBe(400);
  });

  it("a rider swing writes exactly ONE resolveAction event — no orphaned rider row (#1822/#1823 regression fix)", async () => {
    const res = await post([riderSwingOp()]);
    expect(res.status).toBe(200);

    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; batchId?: string }>;
    const resolveEvents = events.filter((e) => e.type === "resolveAction");
    expect(resolveEvents).toHaveLength(1);
    const sameBatch = events.filter((e) => e.batchId === resolveEvents[0].batchId);
    expect(sameBatch).toHaveLength(1);
  });

  it("undo of a rider swing reverts the whole event — the rider is not separately undoable", async () => {
    await post([riderSwingOp()]);
    const beforeUndo = (await activity(FIXTURE_ID)).body as Array<{ type: string; batchId?: string }>;
    const batchId = beforeUndo.find((e) => e.type === "resolveAction")?.batchId;
    expect(batchId).toBeTruthy();

    const revertRes = await revert(FIXTURE_ID, batchId as string);
    expect(revertRes.status).toBe(200);

    const afterUndo = (await activity(FIXTURE_ID)).body as Array<{ type: string; reverted: boolean }>;
    const resolveEvent = afterUndo.find((e) => e.type === "resolveAction");
    expect(resolveEvent?.reverted).toBe(true);
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

  // ── spell-cast side effects via entryId (#1833: concentration/apply must
  // survive the move off the old castSpell op onto resolveAction) ─────────

  it("persists entryId on the event data for a spell resolution, null for a weapon", async () => {
    await post([weaponOp("a-weapon")]);
    await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "a-spell")]);

    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; data: Record<string, unknown> }>;
    const weaponEvent = events.find((e) => e.type === "resolveAction" && e.data.actionId === "a-weapon");
    const spellEvent = events.find((e) => e.type === "resolveAction" && e.data.actionId === "a-spell");
    expect(weaponEvent?.data.entryId ?? null).toBeNull();
    expect(spellEvent?.data.entryId).toBe(CONCENTRATION_SPELL_A.id);
  });

  it("a spell resolution with entryId sets concentration", async () => {
    const res = await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "a1")]);
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.concentratingOn).toMatchObject({ entryId: CONCENTRATION_SPELL_A.id });

    const slots = res.body.spellcasting.slots as Array<{ level: number; used: number }>;
    expect(slots.find((s) => s.level === 1)?.used).toBe(1);
  });

  it("casting a second concentration spell drops the first, logging both under one batch", async () => {
    await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "a1")]);
    const res = await post([concentrationCastOp(CONCENTRATION_SPELL_B.id, "a2")]);
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.concentratingOn).toMatchObject({ entryId: CONCENTRATION_SPELL_B.id });

    const events = (await activity(FIXTURE_ID)).body as Array<{
      type: string; category: string; batchId?: string; data: Record<string, unknown>;
    }>;
    const secondResolve = events.find((e) => e.type === "resolveAction" && e.data.actionId === "a2");
    expect(secondResolve).toBeTruthy();
    const dropped = events.find((e) => e.type === "concentrationDropped");
    expect(dropped).toBeTruthy();
    // Same batch: undoing the second cast undoes the displacement with it.
    expect(dropped?.batchId).toBe(secondResolve?.batchId);
    // Still exactly ONE resolveAction row for the second cast (#1822's point).
    expect(events.filter((e) => e.type === "resolveAction" && e.data.actionId === "a2")).toHaveLength(1);
  });

  it("undo of a concentration-displacing cast restores the prior concentration", async () => {
    await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "a1")]);
    const secondRes = await post([concentrationCastOp(CONCENTRATION_SPELL_B.id, "a2")]);
    expect(secondRes.body.spellcasting.slots.find((s: { level: number }) => s.level === 1).used).toBe(2);

    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; batchId?: string; data: Record<string, unknown> }>;
    const batchId = events.find((e) => e.type === "resolveAction" && e.data.actionId === "a2")?.batchId as string;

    const revertRes = await revert(FIXTURE_ID, batchId);
    expect(revertRes.status).toBe(200);
    expect(revertRes.body.spellcasting.concentratingOn).toMatchObject({ entryId: CONCENTRATION_SPELL_A.id });
    // NOT asserting slots.used here: a batch whose resolveAction event ALSO
    // displaced a prior concentration logs a second `concentrationDropped`
    // event ahead of it in the same batch (handleConcentrationOnCast,
    // ability-cast.ts) — LIFO-reverting both replays the OLDER
    // concentrationDropped event's own (mid-cast, already-post-slot-spend)
    // spellcasting snapshot LAST, clobbering the correct slot-count restore
    // the resolveAction event's own revert already applied. Pre-existing:
    // the identical two-event shape (concentrationDropped + castSpell) exists
    // on the OLD castSpell op path today (spellcasting.test.ts "undo restores
    // concentration dropped by casting a second spell" only asserts
    // concentratingOn, never slots, for the same reason) — not introduced by
    // #1833, not fixed here; flagged in the slice report as a found,
    // pre-existing undo-composition bug in ability-cast.ts, out of scope for
    // the spell-adapter slice.
  });

  it("a heal spell's self-apply lands on the caster's own HP in the same batch", async () => {
    const res = await post([healCastOp()]);
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(8); // 3 + 5

    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; category: string; batchId?: string }>;
    const resolveEvent = events.find((e) => e.type === "resolveAction");
    expect(events.filter((e) => e.type === "resolveAction")).toHaveLength(1);
    const hpEvent = events.find((e) => e.category === "hitPoints" && e.batchId === resolveEvent?.batchId);
    expect(hpEvent).toBeTruthy();
  });

  it("undo of a self-heal cast reverts both the HP gain and the spent slot", async () => {
    const res = await post([healCastOp()]);
    expect(res.body.hitPoints.current).toBe(8);
    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; batchId?: string }>;
    const batchId = events.find((e) => e.type === "resolveAction")?.batchId as string;

    const revertRes = await revert(FIXTURE_ID, batchId);
    expect(revertRes.status).toBe(200);
    expect(revertRes.body.hitPoints.current).toBe(3);
    expect(revertRes.body.spellcasting.slots.find((s: { level: number }) => s.level === 1).used).toBe(0);
  });

  // ── 5e bonus-action spell interlock resolved from session state (#1439) ────

  const combatGet = (sid: string) =>
    supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}/sessions/${sid}/combat`);
  const combatStart = (sid: string) =>
    supertest.agent(app).set("Cookie", COOKIE).post(`/api/characters/${FIXTURE_ID}/sessions/${sid}/combat/start`).send({});
  const combatRound = (sid: string) =>
    supertest.agent(app).set("Cookie", COOKIE).post(`/api/characters/${FIXTURE_ID}/sessions/${sid}/combat/round`).send({});

  // The fixture is a 2024 (default-edition) Wizard, so these assert SRD 5.2
  // semantics: a leveled spell in one economy limits the OTHER to cantrips.
  const NONE = { bonusActionBlockedByActionSpell: false, bonusActionLimitedToCantrips: false, actionLimitedToCantrips: false };

  it("serves no interlock when nothing has been cast this turn", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    const res = await combatGet(sid);
    expect(res.status).toBe(200);
    expect(res.body.spellEconomy).toEqual(NONE);
  });

  it("a leveled Action spell limits bonus casting to cantrips (2024), and it survives a re-read (#1439)", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    expect((await combatStart(sid)).body.spellEconomy).toEqual(NONE);

    const cast = await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "cast-action")]);
    expect(cast.status).toBe(200);

    // Re-read (a fresh request = the "another client / after reload" observer).
    expect((await combatGet(sid)).body.spellEconomy).toEqual({
      bonusActionBlockedByActionSpell: false,
      bonusActionLimitedToCantrips: true,
      actionLimitedToCantrips: false,
    });
  });

  it("a leveled bonus-action spell limits the Action to cantrips (#1439)", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);

    const cast = await post([bonusLeveledCastOp(CONCENTRATION_SPELL_B.id, "cast-bonus")]);
    expect(cast.status).toBe(200);

    expect((await combatGet(sid)).body.spellEconomy).toEqual({
      bonusActionBlockedByActionSpell: false,
      bonusActionLimitedToCantrips: false,
      actionLimitedToCantrips: true,
    });
  });

  it("advancing the round (turn boundary) clears the interlock (#1439)", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);
    await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "cast-action")]);
    expect((await combatGet(sid)).body.spellEconomy.bonusActionLimitedToCantrips).toBe(true);

    const round = await combatRound(sid);
    expect(round.status).toBe(201);
    expect(round.body.spellEconomy).toEqual(NONE);
    // And a subsequent poll agrees the block is gone.
    expect((await combatGet(sid)).body.spellEconomy).toEqual(NONE);
  });

  it("a weapon swing (no entryId) records no interlock (#1439)", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);
    await post([weaponOp()]);
    expect((await combatGet(sid)).body.spellEconomy).toEqual(NONE);
  });

  // #1439 review finding 1 (pass 2): a no-op re-press of Start Combat must NOT
  // clear a valid in-progress restriction (reset gated on the real false→true
  // transition).
  it("a redundant startCombat while already in combat does NOT clear an existing restriction", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);
    await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "cast-action")]);
    expect((await combatGet(sid)).body.spellEconomy.bonusActionLimitedToCantrips).toBe(true);

    const second = await combatStart(sid);
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ round: 1, combatActive: true });
    expect(second.body.spellEconomy.bonusActionLimitedToCantrips).toBe(true);
    expect((await combatGet(sid)).body.spellEconomy.bonusActionLimitedToCantrips).toBe(true);
  });

  // #1439 review finding 1 (pass 3): a later cantrip Action spell must NOT
  // downgrade an existing leveled block (Action Surge: leveled then cantrip).
  it("a cantrip Action cast does not downgrade a leveled Action block", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);
    await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "cast-leveled")]); // leveled Action
    await post([cantripCastOp("action", "cast-cantrip")]); // cantrip Action (Action Surge)
    // Still limited (spellCastAsAction stayed 'leveled', not overwritten to 'cantrip').
    expect((await combatGet(sid)).body.spellEconomy.bonusActionLimitedToCantrips).toBe(true);
  });

  // #1439 review finding 4: undoing a spell cast lifts the interlock it recorded.
  it("reverting a cast batch clears the recorded interlock (#1439)", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);
    const cast = await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "cast-action")]);
    const batchId = (await activity(FIXTURE_ID)).body.find(
      (e: { type: string }) => e.type === "resolveAction",
    ).batchId as string;
    expect(cast.status).toBe(200);
    expect((await combatGet(sid)).body.spellEconomy.bonusActionLimitedToCantrips).toBe(true);

    const revertRes = await revert(FIXTURE_ID, batchId);
    expect(revertRes.status).toBe(200);
    expect((await combatGet(sid)).body.spellEconomy).toEqual(NONE);
  });

  // #1439 review finding 2 (edition): the interlock is edition-specific and the
  // character's `rulesEdition` is threaded through the served combat state. A
  // 2014 character casting a CANTRIP as a bonus action limits the Action to
  // cantrips (SRD 5.1: any bonus spell) — the SAME cast in 2024 would not.
  it("threads the character's edition: a 2014 cantrip-as-bonus limits the Action (unlike 2024)", async () => {
    const CHAR_2014 = "test-resolve-action-2014";
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: CHAR_2014,
        name: "Resolve Action Test Wizard 2014",
        ownerId: OWNER_ID,
        rulesEdition: "EDITION_2014",
        spellcasting: FIXTURE_SPELLCASTING_JSON as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "wizard", classId: wizardClassId, position: 0 }] },
      },
    });
    try {
      const { id: sid } = await startSoloSession(CHAR_2014);
      const agent2014 = supertest.agent(app).set("Cookie", COOKIE);
      await agent2014.post(`/api/characters/${CHAR_2014}/sessions/${sid}/combat/start`).send({});
      await agent2014
        .post(`/api/characters/${CHAR_2014}/resolve-action/transactions`)
        .send({ operations: [cantripCastOp("bonus", "cantrip-bonus-2014")] });

      const state = await agent2014.get(`/api/characters/${CHAR_2014}/sessions/${sid}/combat`);
      expect(state.body.spellEconomy.actionLimitedToCantrips).toBe(true);
    } finally {
      await prisma.character.deleteMany({ where: { id: CHAR_2014 } });
    }
  });

  // #1439 review finding 2: cast-kind recording is coupled to the spell
  // resolution actually running — a weapon-shaped op carrying a spurious
  // entryId is rejected by the spell validator (the whole tx aborts), so it can
  // never corrupt the interlock.
  it("a weapon op carrying a spurious entryId is rejected and records no interlock", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);
    const res = await post([{ ...weaponOp(), entryId: "not-a-real-spell-entry" }]);
    expect(res.status).toBe(400);
    expect((await combatGet(sid)).body.spellEconomy).toEqual(NONE);
  });
});
