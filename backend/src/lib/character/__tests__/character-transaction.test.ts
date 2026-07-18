/**
 * Unit tests for the shared character-transaction preamble (#507). Locks the
 * plumbing contract the 7 domain handlers rely on: batch id + active-session
 * lookup, atomic $transaction, per-op re-read (each op sees the previous op's
 * write), notFound throw, and whole-batch rollback on any throw.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";

const OWNER_ID = "owner-character-transaction";

const MINIMAL_CHARACTER = {
  name: "Tx Preamble Fixture",
  alignment: "True Neutral",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
};

class NotFoundError extends Error {}

describe("runCharacterTransaction", () => {
  let characterId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    const character = await prisma.character.create({
      data: { ...MINIMAL_CHARACTER, ownerId: OWNER_ID, currency: { cp: 0, sp: 0, gp: 0, pp: 0 } },
    });
    characterId = character.id;
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: characterId } });
  });

  it("runs applyOp once per op with a stable batchId and null sessionId when no session", async () => {
    const batchIds = new Set<string>();
    const sessionIds: (string | null)[] = [];
    let calls = 0;

    await runCharacterTransaction<{ experiencePoints: true }, { add: number }>(
      characterId,
      [{ add: 1 }, { add: 2 }],
      {
        select: { experiencePoints: true },
        notFound: (id) => new NotFoundError(id),
        applyOp: async ({ tx, op, batchId, sessionId }) => {
          calls += 1;
          batchIds.add(batchId);
          sessionIds.push(sessionId);
          await tx.character.update({
            where: { id: characterId },
            data: { experiencePoints: { increment: op.add } },
          });
        },
      },
    );

    expect(calls).toBe(2);
    expect(batchIds.size).toBe(1);
    expect([...batchIds][0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(sessionIds).toEqual([null, null]);
  });

  it("re-reads per op so each op sees the previous op's write", async () => {
    const seen: number[] = [];

    await runCharacterTransaction<{ experiencePoints: true }, { add: number }>(
      characterId,
      [{ add: 100 }, { add: 5 }],
      {
        select: { experiencePoints: true },
        notFound: (id) => new NotFoundError(id),
        applyOp: async ({ tx, row, op }) => {
          seen.push(row.experiencePoints);
          await tx.character.update({
            where: { id: characterId },
            data: { experiencePoints: op.add + row.experiencePoints },
          });
        },
      },
    );

    // Second op re-reads the first op's committed-in-tx value (100), not the original 0.
    expect(seen).toEqual([0, 100]);
    const final = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(final.experiencePoints).toBe(105);
  });

  it("throws the caller's notFound error when the character is missing", async () => {
    await expect(
      runCharacterTransaction<{ experiencePoints: true }, { add: number }>(
        "does-not-exist",
        [{ add: 1 }],
        {
          select: { experiencePoints: true },
          notFound: (id) => new NotFoundError(`missing: ${id}`),
          applyOp: async () => {
            throw new Error("applyOp should not run for a missing character");
          },
        },
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("rolls back the whole batch when a later op throws", async () => {
    await expect(
      runCharacterTransaction<{ experiencePoints: true }, { add: number; boom?: boolean }>(
        characterId,
        [{ add: 50 }, { add: 0, boom: true }],
        {
          select: { experiencePoints: true },
          notFound: (id) => new NotFoundError(id),
          applyOp: async ({ tx, op }) => {
            await tx.character.update({
              where: { id: characterId },
              data: { experiencePoints: { increment: op.add } },
            });
            if (op.boom) throw new Error("boom");
          },
        },
      ),
    ).rejects.toThrow("boom");

    // First op's +50 was rolled back with the batch.
    const final = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(final.experiencePoints).toBe(0);
  });

  it("no-ops on an empty operations array (applyOp never runs)", async () => {
    let calls = 0;
    await runCharacterTransaction<{ experiencePoints: true }, { add: number }>(
      characterId,
      [],
      {
        select: { experiencePoints: true },
        notFound: (id) => new NotFoundError(id),
        applyOp: async () => {
          calls += 1;
        },
      },
    );
    expect(calls).toBe(0);
  });

  it("still runs afterOps when the operations array is empty", async () => {
    let afterCalls = 0;
    await runCharacterTransaction<{ experiencePoints: true }, { add: number }>(
      characterId,
      [],
      {
        select: { experiencePoints: true },
        notFound: (id) => new NotFoundError(id),
        applyOp: async () => {
          throw new Error("applyOp should not run for an empty batch");
        },
        afterOps: async () => {
          afterCalls += 1;
        },
      },
    );
    expect(afterCalls).toBe(1);
  });

  it("runs afterOps once after the op loop with the batch's stable ids", async () => {
    const order: string[] = [];
    const batchIds = new Set<string>();
    let afterSessionId: string | null | undefined;

    await runCharacterTransaction<{ experiencePoints: true }, { add: number }>(
      characterId,
      [{ add: 1 }, { add: 2 }],
      {
        select: { experiencePoints: true },
        notFound: (id) => new NotFoundError(id),
        applyOp: async ({ batchId }) => {
          order.push("op");
          batchIds.add(batchId);
        },
        afterOps: async ({ batchId, sessionId }) => {
          order.push("after");
          batchIds.add(batchId);
          afterSessionId = sessionId;
        },
      },
    );

    expect(order).toEqual(["op", "op", "after"]);
    expect(batchIds.size).toBe(1);
    expect(afterSessionId).toBeNull();
  });

  it("uses an explicit sessionId verbatim instead of the active-session lookup", async () => {
    const opSessions: (string | null)[] = [];
    let afterSession: string | null | undefined;

    await runCharacterTransaction<{ experiencePoints: true }, { add: number }>(
      characterId,
      [{ add: 1 }],
      {
        select: { experiencePoints: true },
        notFound: (id) => new NotFoundError(id),
        sessionId: "explicit-session-123",
        applyOp: async ({ sessionId }) => {
          opSessions.push(sessionId);
        },
        afterOps: async ({ sessionId }) => {
          afterSession = sessionId;
        },
      },
    );

    expect(opSessions).toEqual(["explicit-session-123"]);
    expect(afterSession).toBe("explicit-session-123");
  });

  it("passes an explicit null sessionId verbatim, bypassing the active-session lookup", async () => {
    // A real active session so getActiveSessionId would return non-null — the
    // discriminator that proves null is passed verbatim, not looked up.
    const campaign = await prisma.campaign.create({
      data: { name: "Tx Null-Session Campaign", ownerId: OWNER_ID, inviteCode: `tx-null-${characterId}` },
    });
    await prisma.character.update({ where: { id: characterId }, data: { campaignId: campaign.id } });
    const session = await prisma.session.create({
      data: { campaignId: campaign.id, status: "active", startedAt: new Date() },
    });
    await prisma.sessionParticipant.create({ data: { sessionId: session.id, characterId } });

    const opSessions: (string | null)[] = [];
    await runCharacterTransaction<{ experiencePoints: true }, { add: number }>(
      characterId,
      [{ add: 1 }],
      {
        select: { experiencePoints: true },
        notFound: (id) => new NotFoundError(id),
        sessionId: null,
        applyOp: async ({ sessionId }) => {
          opSessions.push(sessionId);
        },
      },
    );

    await prisma.character.update({ where: { id: characterId }, data: { campaignId: null } });
    await prisma.campaign.deleteMany({ where: { id: campaign.id } });
    expect(opSessions).toEqual([null]);
  });

  it("rolls back the op writes when afterOps throws (afterOps runs in the same tx)", async () => {
    await expect(
      runCharacterTransaction<{ experiencePoints: true }, { add: number }>(
        characterId,
        [{ add: 50 }],
        {
          select: { experiencePoints: true },
          notFound: (id) => new NotFoundError(id),
          applyOp: async ({ tx, op }) => {
            await tx.character.update({
              where: { id: characterId },
              data: { experiencePoints: { increment: op.add } },
            });
          },
          afterOps: async () => {
            throw new Error("after-boom");
          },
        },
      ),
    ).rejects.toThrow("after-boom");

    const final = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    expect(final.experiencePoints).toBe(0);
  });
});
