import { Router } from "express";
import { createJournalSchema, updateJournalSchema } from "@character-sheet/contracts";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import type { Prisma, PrismaClient } from "@/generated/prisma/client.js";
import { extractEntityIds, reconcileEntryRefs } from "@/lib/activity/journal-refs.js";
import { prisma } from "@/lib/core/prisma.js";
import { getActiveSessionId } from "@/lib/session/sessions.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

// Journal entries carry no mechanical effect, so these are plain REST routes — no audit log, no undo, no transaction-op pattern.

export const journalRouter = Router();

type Db = PrismaClient | Prisma.TransactionClient;

// Today pinned to UTC midnight, matching dateSchema's UTC-midnight handling.
function utcMidnightToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Outside a campaign there is nothing to share into, so coerce to PRIVATE (never error); inside one, default CAMPAIGN.
async function effectiveVisibility(
  characterId: string,
  requested: "PRIVATE" | "CAMPAIGN" | undefined,
): Promise<"PRIVATE" | "CAMPAIGN"> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { campaignId: true },
  });
  if (!character?.campaignId) return "PRIVATE";
  return requested ?? "CAMPAIGN";
}

// The author's own entries only — a character's journal page never shows other members' notes; CAMPAIGN-visible entries surface elsewhere, on entity backlinks.
export async function visibleEntries(
  db: Db,
  userId: string,
  character: { id: string; campaignId?: string | null },
) {
  return db.journalEntry.findMany({
    where: {
      characterId: character.id,
      authorUserId: userId,
    },
    orderBy: [{ date: "desc" }, { loggedAt: "desc" }, { createdAt: "desc" }],
  });
}

// Materializes @[<uuid>] tags in a body as JournalEntryRef rows: a campaign-less character stores its body verbatim with no refs, and inside a campaign only tokens resolving to a CampaignEntity there survive.
export async function syncEntryRefs(
  tx: Prisma.TransactionClient,
  characterId: string,
  entryId: string,
  body: string,
  userId: string,
) {
  // Fast path: a body with no @[uuid] tokens can only clear refs, so skip both the character and membership lookups entirely.
  const ids = extractEntityIds(body);
  if (ids.length === 0) {
    await reconcileEntryRefs(tx, entryId, []);
    return;
  }

  const character = await tx.character.findUnique({
    where: { id: characterId },
    select: { campaignId: true },
  });
  if (!character?.campaignId) {
    await reconcileEntryRefs(tx, entryId, []);
    return;
  }

  // A non-owner can only tag revealed entities: a UUID guess at a hidden entity is dropped here so it never materializes a backlink that reveals it.
  const membership = await tx.campaignMembership.findUnique({
    where: { campaignId_userId: { campaignId: character.campaignId, userId } },
    select: { role: true },
  });
  const isOwner = membership?.role === "OWNER";

  const valid = await tx.campaignEntity.findMany({
    where: {
      id: { in: ids },
      campaignId: character.campaignId,
      ...(isOwner ? {} : { visibility: "REVEALED" }),
    },
    select: { id: true },
  });
  await reconcileEntryRefs(tx, entryId, valid.map((e) => e.id));
}

async function serializeForCharacter(characterId: string) {
  const updated = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    include: characterInclude,
  });
  return await serializeCharacter(updated);
}

/** POST /api/characters/:id/journal — creates a journal entry (ENTRY by default, or a fast NOTE). */
journalRouter.post("/characters/:id/journal", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const data = parseBodyOr400(createJournalSchema, req.body, res);
  if (data === undefined) return;

  // A NOTE with no explicit session auto-attaches to the character's active session, so in-session capture lands on the right log.
  let sessionId = data.sessionId ?? null;
  if (data.kind === "NOTE" && !sessionId) {
    sessionId = await getActiveSessionId(req.params.id);
  }

  const visibility = await effectiveVisibility(req.params.id, data.visibility);

  await prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        characterId: req.params.id,
        kind: data.kind,
        date: data.date ?? utcMidnightToday(),
        body: data.body,
        visibility,
        authorUserId: req.user!.id,
        sessionId,
      },
    });
    await syncEntryRefs(tx, req.params.id, entry.id, data.body, req.user!.id);
  });

  res.status(201).json(await serializeForCharacter(req.params.id));
});

/** PATCH /api/characters/:id/journal/:entryId — partial update of an existing entry. */
journalRouter.patch("/characters/:id/journal/:entryId", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const data = parseBodyOr400(updateJournalSchema, req.body, res);
  if (data === undefined) return;

  const entry = await prisma.journalEntry.findUnique({
    where: { id: req.params.entryId },
    select: { id: true, characterId: true, authorUserId: true },
  });
  if (!entry || entry.characterId !== req.params.id) {
    res.status(404).json({ error: "Journal entry not found" });
    return;
  }

  // Only the author may re-share or hide their note.
  if (data.visibility !== undefined && entry.authorUserId !== req.user!.id) {
    res.status(403).json({ error: "Only the author may change an entry's visibility" });
    return;
  }
  if (data.visibility !== undefined) {
    data.visibility = await effectiveVisibility(req.params.id, data.visibility);
  }

  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.update({
      where: { id: entry.id },
      data,
    });
    if (data.body !== undefined) {
      await syncEntryRefs(tx, req.params.id, entry.id, data.body, req.user!.id);
    }
  });

  res.json(await serializeForCharacter(req.params.id));
});

/** DELETE /api/characters/:id/journal/:entryId — deletes an entry. */
journalRouter.delete("/characters/:id/journal/:entryId", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const entry = await prisma.journalEntry.findUnique({
    where: { id: req.params.entryId },
    select: { id: true, characterId: true },
  });
  if (!entry || entry.characterId !== req.params.id) {
    res.status(404).json({ error: "Journal entry not found" });
    return;
  }

  await prisma.journalEntry.delete({ where: { id: entry.id } });

  res.json(await serializeForCharacter(req.params.id));
});
