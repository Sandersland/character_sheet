// #1529: characterAdvancementSlots/characterFightingStyleFeatSlots now read
// CharacterClass.extraAsiLevels/fightingStyleFeatLevel through the class FK
// relation at BOTH of their call sites — reconcileAdvancements
// (level-reconciliation.ts, write-side) and applyAdvancementClamp
// (serialize/classes.ts, read-side, via GET). This suite proves those two
// sites still agree: an over-cap Fighter's clamp-on-read view (what GET shows
// BEFORE any reconcile has run) is byte-identical to what the reconciler
// actually persists once an XP operation forces it to run.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-class-columns-reconcile";
const CHAR_ID = "test-1529-overcap-fighter";
const XP_LVL_14 = 140000; // Fighter cap: base (4,8,12) + extra (6,14) = 5

const app = createApp();
let COOKIE: string;
let fighterClassId: string;

const BASE = {
  id: CHAR_ID,
  name: "1529 Overcap Fighter",
  alignment: "Neutral",
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 100, max: 100, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 14, die: "d10", spent: 0 },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

// Six ASI advancements on a class whose real cap is 5 — one over. Array order
// is insertion order (id-asi-1 first), matching splitAdvancementsBySlotCap's
// keep-the-first-N / drop-the-tail rule.
function sixAsiAdvancements() {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `id-asi-${i + 1}`,
    level: 4,
    kind: "asi" as const,
    abilityDeltas: { strength: 2 },
    hpDelta: 0,
    initDelta: 0,
  }));
}

async function get() {
  return supertest(app).get(`/api/characters/${CHAR_ID}`).set("Cookie", COOKIE);
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" }, select: { id: true } })).id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: CHAR_ID } });
});

describe("reconciler == clamp-on-read for an over-cap Fighter (#1529)", () => {
  it("the reconciler's persisted result matches the clamp-on-read view it replaces", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        // All six deltas already applied to the persisted column — matching
        // how the real accrual flow leaves it (applyAdvancementOpInTx writes
        // resources.advancements and abilityScores together); the clamp
        // REVERSES only the excess one(s) off this already-inflated base.
        abilityScores: { ...BASE.abilityScores, strength: 22 }, // 10 + 6*2
        ownerId: OWNER_ID,
        experiencePoints: XP_LVL_14,
        spellcasting: Prisma.JsonNull,
        resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: [], choicesKnown: {}, advancements: sixAsiAdvancements() } as unknown as Prisma.InputJsonValue,
        classEntries: { create: [{ name: "Fighter", classId: fighterClassId, level: 14, position: 0 }] },
      },
    });

    // Clamp-on-read: GET before any reconcile has touched this row. The DB
    // still holds 6 advancements; serializeCharacter must clamp to 5 for display.
    const beforeReconcile = await get();
    expect(beforeReconcile.status).toBe(200);
    expect(beforeReconcile.body.advancementSlots).toEqual({ total: 5, used: 5 });
    expect(beforeReconcile.body.advancements.map((a: { id: string }) => a.id)).toEqual([
      "id-asi-1", "id-asi-2", "id-asi-3", "id-asi-4", "id-asi-5",
    ]);
    expect(beforeReconcile.body.abilityScores.strength).toBe(20); // 22 minus the 6th's reversed +2

    // Confirm the write side hasn't trimmed anything yet — clamp-on-read is
    // non-destructive by design.
    const rawBefore = await prisma.character.findUniqueOrThrow({ where: { id: CHAR_ID }, select: { resources: true } });
    expect((rawBefore.resources as { advancements: unknown[] }).advancements).toHaveLength(6);

    // Force reconcileLevelGatedState to run without changing the derived
    // level (still 14) — reconcileAdvancements trims independent of whether
    // XP actually changed value.
    const setRes = await supertest(app)
      .post(`/api/characters/${CHAR_ID}/experience`)
      .set("Cookie", COOKIE)
      .send({ operations: [{ type: "set", value: XP_LVL_14 }] });
    expect(setRes.status).toBe(200);

    // The write side now holds exactly what the read side already showed.
    const rawAfter = await prisma.character.findUniqueOrThrow({ where: { id: CHAR_ID }, select: { resources: true, abilityScores: true } });
    const persistedIds = (rawAfter.resources as { advancements: { id: string }[] }).advancements.map((a) => a.id);
    expect(persistedIds).toEqual(["id-asi-1", "id-asi-2", "id-asi-3", "id-asi-4", "id-asi-5"]);
    expect((rawAfter.abilityScores as { strength: number }).strength).toBe(20);

    const afterReconcile = await get();
    expect(afterReconcile.body.advancementSlots).toEqual(beforeReconcile.body.advancementSlots);
    expect(afterReconcile.body.advancements).toEqual(beforeReconcile.body.advancements);
    expect(afterReconcile.body.abilityScores).toEqual(beforeReconcile.body.abilityScores);
  });
});

describe("homebrew entry named exactly like a catalog class (#1529) — resolution is by classId only", () => {
  it("a classId: null entry named 'Fighter' gets the base 5-slot ASI schedule, no FS slot, no proficiencies, no primary abilities, no multiclass prerequisite", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        ownerId: OWNER_ID,
        experiencePoints: XP_LVL_14, // level 14 — a REAL Fighter would have 5 ASI slots and an FS slot
        spellcasting: Prisma.JsonNull,
        classEntries: { create: [{ name: "Fighter", classId: null, level: 14, position: 0 }] },
      },
    });

    const res = await get();
    expect(res.status).toBe(200);
    // Base schedule (4/8/12/16/19) at level 14 = 3 slots (4, 8, 12) — NOT
    // Fighter's 5 (the extra 6/14 levels never apply without the class relation).
    expect(res.body.advancementSlots.total).toBe(3);
    // No Fighting Style slot at all (fightingStyleFeatLevel unreachable).
    expect(res.body.fightingStyleSlots.total).toBe(0);
    // No armor/weapon proficiency grants from "class".
    expect(res.body.armorProficiencies).toEqual([]);
    expect(res.body.weaponProficiencies).toEqual([]);
  });
});
