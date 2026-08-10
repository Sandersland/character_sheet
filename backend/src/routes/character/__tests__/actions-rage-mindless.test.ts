/**
 * Mindless Rage (Berserker L6, #1121) — the full package through the real
 * routes (POST …/actions/transactions for the rage toggle, POST
 * …/conditions/transactions for apply/remove), mirroring actions-rage.test.ts's
 * shape.
 *
 * PHB'14 p.49: "you can't be charmed or frightened while raging. If you are
 * charmed or frightened when you enter your rage, the effect is suspended for
 * the duration of the rage" — 2014 SUSPENDS and RESTORES.
 * SRD 5.2 (verified against PHB'24, per #1223 research finding + #1121's own
 * refinement): outright Immunity while raging, and entering Rage ENDS an
 * existing Charmed/Frightened outright — 2024 CLEARS and does NOT restore.
 *
 * Real Postgres in each test; supertest against the shared `app`.
 */

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
  experiencePoints: 14000, // level 6 — Mindless Rage's own grant level
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
      // Mutation proof: swapping this row's conditionImmunitiesOnBuffStart
      // from "clear" to "suspend" would restore Charmed here — it must not.
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
      // Inactive while raging — suspended, not merely hidden.
      expect(activeKeys(raged.body)).toEqual([]);
      expect(raged.body.conditions.suspended).toEqual([
        expect.objectContaining({ key: "frightened", gatingBuffKey: "rage" }),
      ]);

      const ended = await executeAction("endRage");
      expect(ended.status).toBe(200);
      // Mutation proof: swapping this row's conditionImmunitiesOnBuffStart
      // from "suspend" to "clear" (the 2024 behavior) would leave this []
      // instead of restoring Frightened — this assertion is what catches it.
      expect(activeKeys(ended.body)).toEqual(["frightened"]);
      expect(ended.body.conditions.suspended).toEqual([]);
    });

    // #1121 review finding 1 (HIGH): Rage can also end INVOLUNTARILY —
    // falling unconscious or a long rest — never routed through the
    // player-initiated endRage toggle. A suspended condition must still come
    // back, or it is stranded in `suspended` forever.
    it("dropping to 0 HP mid-rage restores the suspended condition (involuntary rage end)", async () => {
      await createBerserker("EDITION_2014");
      const applied = await applyCondition("frightened");
      expect(activeKeys(applied.body)).toEqual(["frightened"]);

      const raged = await executeAction("rage");
      expect(activeKeys(raged.body)).toEqual([]);
      expect(raged.body.conditions.suspended).toEqual([
        expect.objectContaining({ key: "frightened", gatingBuffKey: "rage" }),
      ]);

      // BARB_BASE.hitPoints.current is 60 — this drops it to (clamped) 0.
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
      // Rage itself is gone too — the long rest ended it same as endRage would.
      expect(rested.body.activeEffects.buffs.find((b: { key: string }) => b.key === "rage")).toBeUndefined();
    });

    // #1121 review finding 3 (MEDIUM): a restore must never create a
    // duplicate `active` entry, defensively, regardless of how a stray copy
    // got there — applyConditionInTx's own suspended-dedup (finding 2) is
    // meant to make this unreachable through any real caller, but the restore
    // path itself must not assume that held. Simulated here by writing a
    // duplicate directly to the DB (bypassing every application-level guard),
    // since no real caller can reach this state once finding 2 is fixed.
    // Asserts against the RAW `conditions` column (not the serialized wire
    // response): the wire path re-derives through normalizeConditionsMutable,
    // which dedupes `active` by key on every READ regardless of what got
    // WRITTEN — so a wire-response assertion could never observe a duplicate
    // that the restore path itself failed to prevent.
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

    // #1121 re-review: the apply write-guard must also reject a key sitting
    // in `suspended`, and the immune guard alone does NOT cover it — the
    // immunity gate can lapse while the suspension persists (XP dropped
    // below Mindless Rage's L6 grant mid-rage: deriveImmuneConditions goes
    // empty, `active` is empty, so both older guards pass). A second active
    // copy would make the rage-end restore's dedup silently discard the
    // suspended entry — or resurrect it after a remove.
    it("re-applying a SUSPENDED condition is rejected even after the immunity gate lapses (level-down mid-rage), and rage end restores exactly one copy", async () => {
      await createBerserker("EDITION_2014");
      await applyCondition("frightened");
      const raged = await executeAction("rage");
      expect(raged.body.conditions.suspended).toEqual([
        expect.objectContaining({ key: "frightened", gatingBuffKey: "rage" }),
      ]);

      // Level-down below the Mindless Rage gate while the rage buff (and the
      // suspension) persists — direct write, the same state an XP correction
      // reaches through the real endpoint's reconcilers.
      await prisma.character.update({ where: { id: BARB_ID }, data: { experiencePoints: 0 } });

      const reapplied = await applyCondition("frightened");
      expect(reapplied.status).toBe(400);

      const ended = await executeAction("endRage");
      expect(ended.status).toBe(200);
      expect(ended.body.conditions.suspended).toEqual([]);

      // Raw column, not the wire (normalizeConditionsMutable dedupes on read,
      // so only the persisted JSON can prove no duplicate was written).
      const raw = await prisma.character.findUniqueOrThrow({ where: { id: BARB_ID }, select: { conditions: true } });
      const rawActive = (raw.conditions as { active: { key: string }[] }).active;
      expect(rawActive.filter((e) => e.key === "frightened")).toHaveLength(1);
    });

    // #1121 round-4: LIFO undo replays each event's `before` blob in reverse
    // order, so every restore event must snapshot the state AT ITS OWN STEP.
    // The round-3 batching hoisted the suspended[] shrink above the restore
    // loop, which stamped an already-emptied suspended[] into every restore
    // event's `before` — undoing an endRage then dropped both conditions
    // from active AND suspended instead of re-suspending them.
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

      // Back to the mid-rage state: nothing active, BOTH suspended, rage on.
      expect(activeKeys(rev.body as ConditionsBody)).toEqual([]);
      const suspendedKeys = ((rev.body as ConditionsBody).conditions.suspended ?? []).map((s) => s.key).sort();
      expect(suspendedKeys).toEqual(["charmed", "frightened"]);
      expect(
        (rev.body as { activeEffects: { buffs: { key: string }[] } }).activeEffects.buffs.some((b) => b.key === "rage"),
      ).toBe(true);
    });

    // #1121 review finding 4 (LOW): the restore/clear events log the SAME
    // `data` shape resolveApplyCondition/resolveRemoveCondition already use
    // for every other `conditionApplied`/`conditionRemoved` event — a plural
    // `restoredKeys`/`clearedKeys` array (the pre-fix shape) is a `data`
    // schema no other event of these types has ever carried.
    it("logs the restore/suspend events with the same {key} / {key, source} data shape every other conditionApplied/conditionRemoved event uses", async () => {
      await createBerserker("EDITION_2014");
      await applyCondition("frightened");
      await executeAction("rage"); // suspends Frightened — a conditionRemoved event
      await executeAction("endRage"); // restores it — a conditionApplied event

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
