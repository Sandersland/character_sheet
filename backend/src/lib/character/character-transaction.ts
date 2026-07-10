/**
 * Shared character-transaction preamble — the plumbing every intent-bearing
 * domain handler (resources, spellcasting, conditions, advancement, disciplines,
 * maneuvers, shadow-arts, channel-divinity) repeated verbatim. It owns the batch id, the
 * active-session lookup, the prisma.$transaction wrapper, and the per-op re-read
 * loop; the caller supplies its select extras (5e-rules columns stay in the
 * caller) and the per-op apply logic. This is the documented starting point for
 * the next #416 Phase B migration.
 *
 * No 5e rules live here — this is transaction scaffolding only.
 */

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { getActiveSessionId } from "@/lib/session/sessions.js";

// Per-op context handed to a domain's applyOp callback. `row` is the freshly
// re-read character narrowed to the caller's select; `batchId`/`sessionId` are
// stable across the whole batch so revert groups the ops on one timeline entry.
export interface CharacterTxContext<Row, Op> {
  tx: Prisma.TransactionClient;
  row: Row;
  op: Op;
  characterId: string;
  batchId: string;
  sessionId: string | null;
}

export interface RunCharacterTransactionOptions<S extends Prisma.CharacterSelect, Op> {
  /** Columns/relations to re-read per op (5e-rules columns supplied by the caller). */
  select: S;
  /** Error thrown when the character no longer exists mid-batch. */
  notFound: (characterId: string) => Error;
  /** Validate + mutate for one op; a throw rolls back the whole batch. */
  applyOp: (ctx: CharacterTxContext<Prisma.CharacterGetPayload<{ select: S }>, Op>) => Promise<void>;
}

/**
 * Runs a batch of domain operations atomically: one batchId, one active-session
 * lookup, one $transaction, and a per-op re-read of the character (so a batch of
 * multiple ops sees each previous op's result). Any throw rolls back the batch.
 */
export async function runCharacterTransaction<S extends Prisma.CharacterSelect, Op>(
  characterId: string,
  operations: Op[],
  opts: RunCharacterTransactionOptions<S, Op>,
): Promise<void> {
  const batchId = randomUUID();
  const sessionId = await getActiveSessionId(characterId);

  await prisma.$transaction(async (tx) => {
    for (const op of operations) {
      // Re-read per-op so a batch sees each previous op's result.
      const row = (await tx.character.findUnique({
        where: { id: characterId },
        select: opts.select,
      })) as Prisma.CharacterGetPayload<{ select: S }> | null;
      if (!row) throw opts.notFound(characterId);
      await opts.applyOp({ tx, row, op, characterId, batchId, sessionId });
    }
  });
}
