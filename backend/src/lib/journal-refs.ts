import type { Prisma, PrismaClient } from "@/generated/prisma/client.js";

type Db = PrismaClient | Prisma.TransactionClient;

// An @-tag in a note body is the literal token `@[<uuid>]`. Matched
// case-insensitively; anything that isn't a well-formed v-any uuid is ignored.
const MENTION_TOKEN =
  /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

// Pure, DB-free: pull the tagged entity ids out of a body, lowercased, in
// first-seen order with duplicates removed. Malformed tokens are skipped.
export function extractEntityIds(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN)) {
    seen.add(match[1].toLowerCase());
  }
  return [...seen];
}

// Fold a name/alias/query to a comparison key: lowercase, strip diacritics,
// drop punctuation, collapse whitespace. Kept in parity with the frontend
// normalizeForMatch so search matches the same way on both sides.
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Diff the materialized refs for an entry against the desired set: add the new
// ones, drop the removed ones, leave the unchanged ones untouched (so a no-op
// edit doesn't churn rows). Runs inside the caller's transaction.
export async function reconcileEntryRefs(
  tx: Db,
  entryId: string,
  entityIds: string[],
): Promise<void> {
  const existing = await tx.journalEntryRef.findMany({
    where: { entryId },
    select: { entityId: true },
  });
  const have = new Set(existing.map((r) => r.entityId));
  const want = new Set(entityIds);

  const toAdd = entityIds.filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id));

  if (toRemove.length > 0) {
    await tx.journalEntryRef.deleteMany({
      where: { entryId, entityId: { in: toRemove } },
    });
  }
  if (toAdd.length > 0) {
    await tx.journalEntryRef.createMany({
      data: toAdd.map((entityId) => ({ entryId, entityId })),
      skipDuplicates: true,
    });
  }
}
