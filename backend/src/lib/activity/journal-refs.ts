import type { Prisma, PrismaClient } from "@/generated/prisma/client.js";

type Db = PrismaClient | Prisma.TransactionClient;

// An @-tag in a note body is the literal token `@[<uuid>]`, matched case-insensitively; anything that isn't a well-formed uuid is ignored.
const MENTION_TOKEN =
  /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

export function extractEntityIds(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN)) {
    seen.add(match[1].toLowerCase());
  }
  return [...seen];
}

// The one place the @[...] wrapper is hard-coded, so a caller building a replacement string (e.g. #1942's combine op) can't drift from what extractEntityIds matches.
export function mentionToken(entityId: string): string {
  return `@[${entityId}]`;
}

// Used by mentionTokenPattern so an id containing regex-special characters can't change what the pattern matches — CampaignEntity.id is a plain String column, not (yet) enforced to be a uuid shape.
function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// `[`/`]` are regex metacharacters, so a caller must never hand-splice `@[${id}]` into a pattern — use this instead, which also escapes the id itself.
export function mentionTokenPattern(entityId: string): string {
  return `@\\[${escapeRegexLiteral(entityId)}\\]`;
}

// fallow-ignore-next-line code-duplication -- pre-existing mirror against the frontend's own normalizeForMatch (the search-parity requirement this comment states); surfaced only because #1942 touched this file elsewhere, not introduced by it
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

// Only touches added/removed refs, so a no-op edit doesn't churn rows. Runs inside the caller's transaction.
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
