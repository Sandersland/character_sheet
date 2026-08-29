// PHB'14 p.49: charmed/frightened while raging is suspended, then restored when rage ends.
// SRD 5.2: outright immunity while raging; entering Rage clears (does not restore) an existing Charmed/Frightened.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { Prisma } from "@/generated/prisma/client.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-actions-rage-mindless";
let COOKIE: string;

const BARB_ID = "test-actions-rage-mindless-barbarian";
let barbClassId: string;
let berserkerId: string;

const BARB_BASE = {
  id: BARB_ID,
  name: "Mindless Rage Test Barbarian",
  alignment: "Chaotic Neutral",
  experiencePoints: 14000,
  initiativeBonus: 2,
  speed: 40,
  hitPoints: { current: 60, max: 60, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 6, die: "d12", spent: 0 },
  abilityScores: { strength: 16, dexterity: 14, constitution: 14, intelligence: 8, wisdom: 10, charisma: 8 },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

async function createBerserker(rulesEdition: "EDITION_2014" | "EDITION_2024") {
  await prisma.character.create({
    data: {
      ...BARB_BASE,
      rulesEdition,
      ownerId: OWNER_ID,
      classEntries: {
        create: [{ name: "barbarian", subclass: "Berserker", subclassId: berserkerId, classId: barbClassId, position: 0, level: 6 }],
      },
    },
  });
}

function executeAction(actionKey: string) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${BARB_ID}/actions/transactions`)
    .send({ operations: [{ type: "executeAction", actionKey }] });
}

function applyCondition(key: string) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${BARB_ID}/conditions/transactions`)
    .send({ operations: [{ type: "applyCondition", key }] });
}

function damage(amount: number) {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${BARB_ID}/hp`)
    .send({ operations: [{ type: "damage", amount, damageType: "fire" }] });
}

function longRest() {
  return supertest
    .agent(app)
    .set("Cookie", COOKIE)
    .post(`/api/characters/${BARB_ID}/hp`)
    .send({ operations: [{ type: "longRest" }] });
}

interface ConditionsBody {
  conditions: { active: { key: string }[]; suspended?: { key: string; gatingBuffKey: string }[] };
  immuneConditions?: string[];
}

function activeKeys(body: ConditionsBody): string[] {
  return body.conditions.active.map((e) => e.key);
}

interface ActivityEvent {
  type: string;
  summary: string;
  data?: Record<string, unknown>;
}

async function activity(): Promise<ActivityEvent[]> {
  const res = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${BARB_ID}/activity`);
  expect(res.status).toBe(200);
  return res.body as ActivityEvent[];
}

describe("Mindless Rage (Berserker L6, #1121)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    barbClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Barbarian" } })).id;
    berserkerId = (await prisma.subclass.findFirstOrThrow({ where: { classId: barbClassId, name: "Berserker" } })).id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: BARB_ID } });
  });

  describe("EDITION_2024 — outright immunity, clears on rage start, does NOT restore on rage end", () => {
    it("a raging Berserker cannot be given Charmed or Frightened", async () => {
      await createBerserker("EDITION_2024");
      await executeAction("rage");

      const charmed = await applyCondition("charmed");
      expect(charmed.status).toBe(400);
      const frightened = await applyCondition("frightened");
      expect(frightened.status).toBe(400);
    });

    it("entering Rage with a pre-existing Charmed ends it outright — it does NOT return when Rage ends", async () => {
      await createBerserker("EDITION_2024");
      const applied = await applyCondition("charmed");
      expect(applied.status).toBe(200);
      expect(activeKeys(applied.body)).toEqual(["charmed"]);

      const raged = await executeAction("rage");
      expect(raged.status).toBe(200);
      expect(activeKeys(raged.body)).toEqual([]);

      const ended = await executeAction("endRage");
      expect(ended.status).toBe(200);
      // Proves conditionImmunitiesOnBuffStart is "clear", not "suspend".
      expect(activeKeys(ended.body)).toEqual([]);
    });
  });

  describe("EDITION_2014 — suspend-and-restore (PHB'14 p.49)", () => {
    it("a raging Berserker cannot be given Charmed or Frightened", async () => {
      await createBerserker("EDITION_2014");
      await executeAction("rage");

      const charmed = await applyCondition("charmed");
      expect(charmed.status).toBe(400);
      const frightened = await applyCondition("frightened");
      expect(frightened.status).toBe(400);
    });

    it("entering Rage with a pre-existing Frightened suspends it (inactive while raging) and RESTORES it when Rage ends", async () => {
      await createBerserker("EDITION_2014");
      const applied = await applyCondition("frightened");
      expect(applied.status).toBe(200);
      expect(activeKeys(applied.body)).toEqual(["frightened"]);

      const raged = await executeAction("rage");
      expect(raged.status).toBe(200);
      expect(activeKeys(raged.body)).toEqual([]);
      expect(raged.body.conditions.suspended).toEqual([
        expect.objectContaining({ key: "frightened", gatingBuffKey: "rage" }),
      ]);

      const ended = await executeAction("endRage");
      expect(ended.status).toBe(200);
      // Proves conditionImmunitiesOnBuffStart is "suspend", not "clear" (the 2024 behavior).
      expect(activeKeys(ended.body)).toEqual(["frightened"]);
      expect(ended.body.conditions.suspended).toEqual([]);
    });

    // Rage can end involuntarily (0 HP, long rest), bypassing endRage — a suspended condition must still restore (#1121).
    it("dropping to 0 HP mid-rage restores the suspended condition (involuntary rage end)", async () => {
      await createBerserker("EDITION_2014");
      const applied = await applyCondition("frightened");
      expect(activeKeys(applied.body)).toEqual(["frightened"]);

      const raged = await executeAction("rage");
      expect(activeKeys(raged.body)).toEqual([]);
      expect(raged.body.conditions.suspended).toEqual([
        expect.objectContaining({ key: "frightened", gatingBuffKey: "rage" }),
      ]);

      const dropped = await damage(100);
      expect(dropped.status).toBe(200);
      expect(dropped.body.hitPoints.current).toBe(0);
      expect(activeKeys(dropped.body)).toEqual(["frightened"]);
      expect(dropped.body.conditions.suspended).toEqual([]);
    });

    it("a long rest ending an active Rage restores the suspended condition (involuntary rage end)", async () => {
      await createBerserker("EDITION_2014");
      const applied = await applyCondition("charmed");
      expect(activeKeys(applied.body)).toEqual(["charmed"]);

      const raged = await executeAction("rage");
      expect(activeKeys(raged.body)).toEqual([]);
      expect(raged.body.conditions.suspended).toEqual([
        expect.objectContaining({ key: "charmed", gatingBuffKey: "rage" }),
      ]);

      const rested = await longRest();
      expect(rested.status).toBe(200);
      expect(activeKeys(rested.body)).toEqual(["charmed"]);
      expect(rested.body.conditions.suspended).toEqual([]);
      expect(rested.body.activeEffects.buffs.find((b: { key: string }) => b.key === "rage")).toBeUndefined();
    });

    // Asserts the raw `conditions` column — normalizeConditionsMutable dedupes `active` by key on every read, so a wire response could never show a duplicate the write path failed to prevent.
    it("restoring a suspended condition never duplicates one that is already active by the time the buff ends", async () => {
      await createBerserker("EDITION_2014");
      await applyCondition("frightened");
      const raged = await executeAction("rage");
      expect(activeKeys(raged.body)).toEqual([]);

      const row = await prisma.character.findUniqueOrThrow({ where: { id: BARB_ID }, select: { conditions: true } });
      const conditions = row.conditions as { active: unknown[]; exhaustion: number; suspended: unknown[] };
      await prisma.character.update({
        where: { id: BARB_ID },
        data: {
          conditions: {
            ...conditions,
            active: [...conditions.active, { key: "frightened", source: "stray duplicate", appliedAt: new Date().toISOString() }],
          } as unknown as Prisma.InputJsonValue,
        },
      });

      const ended = await executeAction("endRage");
      expect(ended.status).toBe(200);

      const rawAfter = await prisma.character.findUniqueOrThrow({ where: { id: BARB_ID }, select: { conditions: true } });
      const rawActive = (rawAfter.conditions as { active: { key: string }[] }).active;
      expect(rawActive.filter((e) => e.key === "frightened")).toHaveLength(1);
    });

    // The apply guard must also reject a key in `suspended` — the immunity gate alone can lapse (level-down mid-rage) while the suspension persists.
    it("re-applying a SUSPENDED condition is rejected even after the immunity gate lapses (level-down mid-rage), and rage end restores exactly one copy", async () => {
      await createBerserker("EDITION_2014");
      await applyCondition("frightened");
      const raged = await executeAction("rage");
      expect(raged.body.conditions.suspended).toEqual([
        expect.objectContaining({ key: "frightened", gatingBuffKey: "rage" }),
      ]);

      // Direct write reaches the same state an XP correction reaches through the real reconcilers.
      await prisma.character.update({ where: { id: BARB_ID }, data: { experiencePoints: 0 } });

      const reapplied = await applyCondition("frightened");
      expect(reapplied.status).toBe(400);

      const ended = await executeAction("endRage");
      expect(ended.status).toBe(200);
      expect(ended.body.conditions.suspended).toEqual([]);

      // Raw column — normalizeConditionsMutable dedupes `active` on every read.
      const raw = await prisma.character.findUniqueOrThrow({ where: { id: BARB_ID }, select: { conditions: true } });
      const rawActive = (raw.conditions as { active: { key: string }[] }).active;
      expect(rawActive.filter((e) => e.key === "frightened")).toHaveLength(1);
    });

    // LIFO undo replays each event's `before` blob in reverse order — every restore event must snapshot state at its own step.
    it("undoing an endRage batch re-suspends every restored condition (per-step event snapshots)", async () => {
      await createBerserker("EDITION_2014");
      await applyCondition("charmed");
      await applyCondition("frightened");
      const raged = await executeAction("rage");
      expect(raged.body.conditions.suspended).toHaveLength(2);

      const ended = await executeAction("endRage");
      expect([...activeKeys(ended.body)].sort()).toEqual(["charmed", "frightened"]);
      expect(ended.body.conditions.suspended).toEqual([]);

      const act = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${BARB_ID}/activity`);
      const batchId = (act.body as { batchId: string }[])[0].batchId;
      const rev = await supertest
        .agent(app)
        .set("Cookie", COOKIE)
        .post(`/api/characters/${BARB_ID}/events/${batchId}/revert`)
        .send({});
      expect(rev.status).toBe(200);

      expect(activeKeys(rev.body as ConditionsBody)).toEqual([]);
      const suspendedKeys = ((rev.body as ConditionsBody).conditions.suspended ?? []).map((s) => s.key).sort();
      expect(suspendedKeys).toEqual(["charmed", "frightened"]);
      expect(
        (rev.body as { activeEffects: { buffs: { key: string }[] } }).activeEffects.buffs.some((b) => b.key === "rage"),
      ).toBe(true);
    });

    it("logs the restore/suspend events with the same {key} / {key, source} data shape every other conditionApplied/conditionRemoved event uses", async () => {
      await createBerserker("EDITION_2014");
      await applyCondition("frightened");
      await executeAction("rage");
      await executeAction("endRage");

      const events = await activity();
      const suspendEvent = events.find((e) => e.type === "conditionRemoved" && e.summary.includes("started"));
      expect(suspendEvent?.data).toEqual({ key: "frightened" });

      const restoreEvent = events.find((e) => e.type === "conditionApplied" && e.summary.includes("Restored"));
      expect(restoreEvent?.data).toEqual({ key: "frightened", source: null });
    });
  });

  it("immuneConditions on the serialized character reflects Mindless Rage only while raging", async () => {
    await createBerserker("EDITION_2024");
    const before = await supertest.agent(app).set("Cookie", COOKIE).get(`/api/characters/${BARB_ID}`);
    expect(before.body.immuneConditions).not.toEqual(expect.arrayContaining(["charmed"]));

    const raged = await executeAction("rage");
    expect(raged.body.immuneConditions).toEqual(expect.arrayContaining(["charmed", "frightened"]));

    const ended = await executeAction("endRage");
    expect(ended.body.immuneConditions).not.toEqual(expect.arrayContaining(["charmed"]));
  });
});
