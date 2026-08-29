import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { getActiveSessionId } from "@/lib/session/sessions.js";

export interface CharacterTxContext<Row, Op> {
  tx: Prisma.TransactionClient;
  row: Row;
  op: Op;
  characterId: string;
  batchId: string;
  sessionId: string | null;
}

export interface RunCharacterTransactionOptions<S extends Prisma.CharacterSelect, Op> {
  select: S;
  notFound: (characterId: string) => Error;
  // A throw rolls back the whole batch.
  applyOp: (ctx: CharacterTxContext<Prisma.CharacterGetPayload<{ select: S }>, Op>) => Promise<void>;
  // Provided (including null) to tag events with this id instead of calling getActiveSessionId.
  sessionId?: string | null;
  // Runs inside the same $transaction after the op loop, including when operations is empty.
  afterOps?: (ctx: {
    tx: Prisma.TransactionClient;
    characterId: string;
    batchId: string;
    sessionId: string | null;
  }) => Promise<void>;
}

// Character mutable state (hitPoints, resources, conditions, ...) is whole-JSON read-modify-write:
// without this lock, two concurrent transactions on the same character each read the pre-update
// blob and the later write silently clobbers the earlier one.
// COUPLING LATCH: every top-level transaction that writes Character must call this FIRST, before
// any read — currently runCharacterTransaction, actionsRouter, revertBatch, and charactersRouter's
// PATCH /characters/:id handler (bondWeapon/unbondWeapon and applyAttune also call it, but
// re-entrantly from an already-locked transaction). A new Character-writing transaction that
// skips this reintroduces the race.
export async function lockCharacterRow(tx: Prisma.TransactionClient, characterId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
}

export async function runCharacterTransaction<S extends Prisma.CharacterSelect, Op>(
  characterId: string,
  operations: Op[],
  opts: RunCharacterTransactionOptions<S, Op>,
): Promise<string> {
  const batchId = randomUUID();
  const sessionId =
    opts.sessionId !== undefined ? opts.sessionId : await getActiveSessionId(characterId);

  await prisma.$transaction(
    async (tx) => {
      await lockCharacterRow(tx, characterId);

      for (const op of operations) {
        // Re-read per op so a batch of multiple ops sees each previous op's result.
        const row = (await tx.character.findUnique({
          where: { id: characterId },
          select: opts.select,
        })) as Prisma.CharacterGetPayload<{ select: S }> | null;
        if (!row) throw opts.notFound(characterId);
        await opts.applyOp({ tx, row, op, characterId, batchId, sessionId });
      }
      if (opts.afterOps) await opts.afterOps({ tx, characterId, batchId, sessionId });
    },
    // Generous timeout: the row lock above means real contention (a queued concurrent request)
    // waits out the whole batch ahead of it, mirroring combineEntities' precedent.
    { timeout: 30_000 },
  );

  // Returned so endpoints can hand the client the batch id to revert on turn undo (#758).
  return batchId;
}
