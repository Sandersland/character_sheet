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
  experiencePoints: 0,
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

// normalizeSpellcastingMutable reads the JSON blob directly — no catalog join needed for a hand-built SpellEntry fixture (#1833).
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

// A dedicated leveled, non-concentration entry for instances[] tests (#1982) — reusing a concentration
// fixture would tangle slot-spend/interlock assertions with concentration side effects.
const MULTI_INSTANCE_SPELL = {
  id: "entry-multi-instance",
  name: "Test Magic Missile",
  level: 1,
  school: "evocation",
  prepared: true,
  castingTime: "1 action",
  range: "120 feet",
  duration: "Instantaneous",
  description: "",
  concentration: false,
};

// Casting a cantrip spends no slot, so the interlock records it as cantrip — it must not downgrade a leveled block (#1439).
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
  spells: [CONCENTRATION_SPELL_A, CONCENTRATION_SPELL_B, HEAL_SPELL, CANTRIP_SPELL, MULTI_INSTANCE_SPELL],
  concentratingOn: null,
};

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

// The primary `effect` is the weapon's own damage; `riders` is the additive second typed term (Flame Tongue, #1843).
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

// Magic Missile's three darts (#1981/#1982): instances[] instead of a single top-level effect.
function instancedLeveledCastOp(actionId = "action-mm") {
  return {
    type: "resolveAction" as const,
    actionId,
    source: "Test Magic Missile",
    cost: { kind: "action" as const },
    instances: [
      { effect: { spec: "1d4+1", faces: [2], total: 3, type: "force", kind: "damage" as const, crit: false } },
      { effect: { spec: "1d4+1", faces: [3], total: 4, type: "force", kind: "damage" as const, crit: false } },
      { effect: { spec: "1d4+1", faces: [4], total: 5, type: "force", kind: "damage" as const, crit: false } },
    ],
    slotLevel: 1,
    entryId: MULTI_INSTANCE_SPELL.id,
  };
}

// A cantrip's instances[] form: entryId present (routes through castSpellForResolutionInTx), no slotLevel.
function instancedCantripCastOp(actionId = "action-eb") {
  return {
    type: "resolveAction" as const,
    actionId,
    source: "Test Fire Bolt",
    cost: { kind: "action" as const },
    instances: [
      { effect: { spec: "1d10", faces: [6], total: 6, type: "fire", kind: "damage" as const, crit: false } },
    ],
    entryId: CANTRIP_SPELL.id,
  };
}

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

// entryId routes through castSpellForResolutionInTx (concentration/buff/apply), not the bare slot-only path leveledCastOp exercises (#1833).
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

// entryId + cost.kind "bonus" routes through the recorder onto spellCastAsBonus (#1439).
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

// entryId with no slotLevel classifies as a cantrip cast in whichever economy slot `cost.kind` names.
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
    // res.body.batchId is what the client threads into turn undo (#758).
    expect(res.body.batchId).toBe(resolveEvents[0].batchId);
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
    const res = await post([leveledCastOp("a3")]);
    expect(res.status).toBe(400);
  });

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

  it("stores a rider's attributing source verbatim when the op carries one", async () => {
    const op = riderSwingOp();
    const rider = { ...op.riders[0], spec: "1d6", faces: [2], total: 2, type: "slashing", source: "Sneak Attack" };
    const res = await post([{ ...op, riders: [rider] }]);
    expect(res.status).toBe(200);

    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; data: Record<string, unknown> }>;
    const resolveEvent = events.find((e) => e.type === "resolveAction");
    expect(resolveEvent?.data.riders).toEqual([rider]);
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
    // Exactly one resolveAction row for the second cast (#1822).
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
    // The batch's LIFO revert order (resolveAction event first, then concentrationDropped) must not let concentrationDropped's revert clobber the slot-count restore (#1849).
    expect(revertRes.body.spellcasting.slots.find((s: { level: number }) => s.level === 1).used).toBe(1);
  });

  it("a heal spell's self-apply lands on the caster's own HP in the same batch", async () => {
    const res = await post([healCastOp()]);
    expect(res.status).toBe(200);
    expect(res.body.hitPoints.current).toBe(8);

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

  const combatGet = (sid: string) =>
    supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${FIXTURE_ID}/sessions/${sid}/combat`);
  const combatStart = (sid: string) =>
    supertest.agent(app).set("Cookie", COOKIE).post(`/api/characters/${FIXTURE_ID}/sessions/${sid}/combat/start`).send({});
  const combatRound = (sid: string) =>
    supertest.agent(app).set("Cookie", COOKIE).post(`/api/characters/${FIXTURE_ID}/sessions/${sid}/combat/round`).send({});
  const combatEnd = (sid: string) =>
    supertest.agent(app).set("Cookie", COOKIE).post(`/api/characters/${FIXTURE_ID}/sessions/${sid}/combat/end`).send({});

  // SRD 5.2: a leveled spell in one economy limits the other to cantrips.
  const NONE = { bonusActionBlockedByActionSpell: false, bonusActionLimitedToCantrips: false, actionLimitedToCantrips: false };

  it("serves no interlock when nothing has been cast this turn", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    const res = await combatGet(sid);
    expect(res.status).toBe(200);
    expect(res.body.spellEconomy).toEqual(NONE);
  });

  // The interlock is a per-turn/combat concept; a leveled cast while combatActive=false must not record it, or the block would linger until startCombat/round advance.
  it("a leveled Action cast out of combat (combatActive=false) records no interlock", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    const cast = await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "cast-action")]);
    expect(cast.status).toBe(200);

    const participant = await prisma.sessionParticipant.findFirstOrThrow({
      where: { sessionId: sid, characterId: FIXTURE_ID },
      select: { spellCastAsAction: true, spellCastAsBonus: true },
    });
    expect(participant.spellCastAsAction).toBeNull();
    expect(participant.spellCastAsBonus).toBeNull();
    expect((await combatGet(sid)).body.spellEconomy).toEqual(NONE);
  });

  // The combatActive check lives inside the write's WHERE clause, not a separate read-then-write, so a cast landing after combat ends strands no interlock (no TOCTOU race).
  it("a leveled Action cast after combat has ended strands no interlock (atomic combatActive filter)", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);
    await combatEnd(sid);

    const cast = await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "cast-action")]);
    expect(cast.status).toBe(200);

    const participant = await prisma.sessionParticipant.findFirstOrThrow({
      where: { sessionId: sid, characterId: FIXTURE_ID },
      select: { spellCastAsAction: true, spellCastAsBonus: true },
    });
    expect(participant.spellCastAsAction).toBeNull();
    expect(participant.spellCastAsBonus).toBeNull();
    expect((await combatGet(sid)).body.spellEconomy).toEqual(NONE);
  });

  it("a leveled Action spell limits bonus casting to cantrips (2024), and it survives a re-read (#1439)", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    expect((await combatStart(sid)).body.spellEconomy).toEqual(NONE);

    const cast = await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "cast-action")]);
    expect(cast.status).toBe(200);

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
    expect((await combatGet(sid)).body.spellEconomy).toEqual(NONE);
  });

  it("a weapon swing (no entryId) records no interlock (#1439)", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);
    await post([weaponOp()]);
    expect((await combatGet(sid)).body.spellEconomy).toEqual(NONE);
  });

  // A no-op re-press of Start Combat must not clear an in-progress restriction — reset is gated on the real false→true transition.
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

  // A later cantrip Action spell must not downgrade an existing leveled block (Action Surge: leveled then cantrip).
  it("a cantrip Action cast does not downgrade a leveled Action block", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);
    await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "cast-leveled")]);
    await post([cantripCastOp("action", "cast-cantrip")]);
    expect((await combatGet(sid)).body.spellEconomy.bonusActionLimitedToCantrips).toBe(true);
  });

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

  // Undoing a cantrip cast must not clear a leveled block set by an earlier leveled cast on the same economy slot (Action Surge).
  it("reverting an Action-Surge cantrip does NOT lift a leveled Action block", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);
    await post([concentrationCastOp(CONCENTRATION_SPELL_A.id, "cast-leveled")]);
    await post([cantripCastOp("action", "cast-cantrip")]);

    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; batchId?: string; data?: { actionId?: string } }>;
    const cantripBatch = events.find((e) => e.type === "resolveAction" && e.data?.actionId === "cast-cantrip")?.batchId as string;
    expect(await revert(FIXTURE_ID, cantripBatch).then((r) => r.status)).toBe(200);

    const participant = await prisma.sessionParticipant.findFirstOrThrow({
      where: { sessionId: sid, characterId: FIXTURE_ID },
      select: { spellCastAsAction: true },
    });
    expect(participant.spellCastAsAction).toBe("leveled");
    expect((await combatGet(sid)).body.spellEconomy.bonusActionLimitedToCantrips).toBe(true);
  });

  // SRD 5.1: any bonus spell limits the Action to cantrips. The interlock is edition-specific via rulesEdition; the same cast in 2024 would not.
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

  // A weapon-shaped op carrying a spurious entryId is rejected by the spell validator (the whole tx aborts), so it can never corrupt the interlock.
  it("a weapon op carrying a spurious entryId is rejected and records no interlock", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);
    const res = await post([{ ...weaponOp(), entryId: "not-a-real-spell-entry" }]);
    expect(res.status).toBe(400);
    expect((await combatGet(sid)).body.spellEconomy).toEqual(NONE);
  });

  it("accepts a 3-instance op and stores instances[] verbatim, with the top-level effect null", async () => {
    const res = await post([instancedLeveledCastOp()]);
    expect(res.status).toBe(200);

    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; data: Record<string, unknown> }>;
    const resolveEvent = events.find((e) => e.type === "resolveAction");
    expect(resolveEvent?.data.instances).toEqual(instancedLeveledCastOp().instances);
    expect(resolveEvent?.data.effect ?? null).toBeNull();
  });

  it("mentions the instance count in the event summary when instances.length > 1", async () => {
    await post([instancedLeveledCastOp()]);
    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; summary: string }>;
    expect(events.find((e) => e.type === "resolveAction")?.summary).toBe("Resolved Test Magic Missile (action, 3 instances)");
  });

  it("400s when instances is provided alongside a top-level effect", async () => {
    const op = instancedLeveledCastOp();
    const res = await post([
      { ...op, effect: { spec: "1d4+1", faces: [2], total: 3, type: "force", kind: "damage" as const, crit: false } },
    ]);
    expect(res.status).toBe(400);
  });

  it("400s when instances is provided alongside a top-level toHit", async () => {
    const op = weaponOp();
    const res = await post([{ ...op, instances: [{ effect: op.effect }] }]);
    expect(res.status).toBe(400);
  });

  it("400s on a per-instance cross-check violation (kept die not among instance 2's faces)", async () => {
    const op = weaponOp();
    const goodInstance = { toHit: op.toHit };
    const badInstance = { toHit: { ...op.toHit, faces: [3, 8], kept: 15 } };
    const res = await post([
      { type: "resolveAction", actionId: "a-cross-check", source: "Scorching Ray", cost: { kind: "action" as const }, instances: [goodInstance, badInstance] },
    ]);
    expect(res.status).toBe(400);
  });

  it("400s on an empty instances array", async () => {
    const res = await post([
      { type: "resolveAction", actionId: "a-empty", source: "Test Spell", cost: { kind: "action" as const }, instances: [] },
    ]);
    expect(res.status).toBe(400);
  });

  it("a 3-instance leveled-spell op writes ONE resolveAction event, pays the slot once, and records one interlock cast", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);

    const res = await post([instancedLeveledCastOp()]);
    expect(res.status).toBe(200);

    const slots = res.body.spellcasting.slots as Array<{ level: number; used: number }>;
    expect(slots.find((s) => s.level === 1)?.used).toBe(1);

    const events = (await activity(FIXTURE_ID)).body as Array<{
      type: string; batchId?: string; data: Record<string, unknown>;
    }>;
    const resolveEvents = events.filter((e) => e.type === "resolveAction");
    expect(resolveEvents).toHaveLength(1);
    expect((resolveEvents[0].data.instances as unknown[]).length).toBe(3);
    const sameBatch = events.filter((e) => e.batchId === resolveEvents[0].batchId);
    expect(sameBatch).toHaveLength(1);

    expect((await combatGet(sid)).body.spellEconomy).toEqual({
      bonusActionBlockedByActionSpell: false,
      bonusActionLimitedToCantrips: true,
      actionLimitedToCantrips: false,
    });
  });

  it("LIFO undo of an instanced cast batch restores the spent slot", async () => {
    await post([instancedLeveledCastOp()]);
    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; batchId?: string }>;
    const batchId = events.find((e) => e.type === "resolveAction")?.batchId;
    expect(batchId).toBeTruthy();

    const revertRes = await revert(FIXTURE_ID, batchId as string);
    expect(revertRes.status).toBe(200);
    const slots = revertRes.body.spellcasting.slots as Array<{ level: number; used: number }>;
    expect(slots.find((s) => s.level === 1)?.used).toBe(0);

    const afterUndo = (await activity(FIXTURE_ID)).body as Array<{ type: string; reverted: boolean }>;
    expect(afterUndo.find((e) => e.type === "resolveAction")?.reverted).toBe(true);
  });

  it("a cantrip instanced op (entryId, no slotLevel) works and records no interlock restriction", async () => {
    const { id: sid } = await startSoloSession(FIXTURE_ID);
    await combatStart(sid);

    const res = await post([instancedCantripCastOp()]);
    expect(res.status).toBe(200);

    const events = (await activity(FIXTURE_ID)).body as Array<{ type: string; data: Record<string, unknown> }>;
    const resolveEvent = events.find((e) => e.type === "resolveAction");
    expect(resolveEvent?.data.slotLevel ?? null).toBeNull();
    expect((resolveEvent?.data.instances as unknown[]).length).toBe(1);

    expect((await combatGet(sid)).body.spellEconomy).toEqual(NONE);
  });
});
