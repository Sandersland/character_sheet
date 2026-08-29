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

export async function runCharacterTransaction<S extends Prisma.CharacterSelect, Op>(
  characterId: string,
  operations: Op[],
  opts: RunCharacterTransactionOptions<S, Op>,
): Promise<string> {
  const batchId = randomUUID();
  const sessionId =
    opts.sessionId !== undefined ? opts.sessionId : await getActiveSessionId(characterId);

  await prisma.$transaction(async (tx) => {
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
  });

  // Returned so endpoints can hand the client the batch id to revert on turn undo (#758).
  return batchId;
}
