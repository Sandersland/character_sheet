import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import type { Prisma, PrismaClient } from "@/generated/prisma/client.js";
import { extractEntityIds, reconcileEntryRefs } from "@/lib/activity/journal-refs.js";
import { prisma } from "@/lib/core/prisma.js";
import { getActiveSessionId } from "@/lib/session/sessions.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

// Freeform campaign journal CRUD. Unlike inventory/HP/XP/spellcasting, journal
// entries carry no mechanical effect, so these are PLAIN REST routes: no audit
// log (logEvent), no undo, no transaction-op pattern. Each mutation writes
// directly to the JournalEntry table, then re-fetches the character with the
// standard include and returns the full serialized character (same response
// shape as every other character-mutating endpoint, so the frontend can swap
// its Character state in one assignment).
//
// Two kinds share the table: full ENTRY rows (date/body form) and fast NOTE rows
// (one-line in-session capture). Both are date + body; NOTE defaults its date to
// today. Entries default to CAMPAIGN visibility inside a campaign (author can
// opt out via visibility: "PRIVATE"); campaign-less characters always write
// PRIVATE. Sharing surfaces on entity backlinks (entities.ts), not here.

export const journalRouter = Router();

type Db = PrismaClient | Prisma.TransactionClient;

// `date` is a calendar date with no meaningful time-of-day. Accept ONLY the
// yyyy-mm-dd string the client's <input type="date"> produces and pin it to UTC
// midnight, so the stored value can never drift a day from what the user picked.
// (A bare z.coerce.date() would accept tz-offset datetimes like
// "2026-06-22T23:00:00-05:00" → stored 2026-06-23, displayed a day off.)
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD calendar date")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

// Today pinned to UTC midnight — the default `date` for a NOTE captured without
// an explicit calendar date, matching dateSchema's UTC-midnight handling.
function utcMidnightToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// date is required for ENTRY (the full form) but defaults to today for a NOTE.
const createJournalSchema = z
  .object({
    kind: z.enum(["NOTE", "ENTRY"]).default("ENTRY"),
    date: dateSchema.optional(),
    body: z.string().min(1),
    sessionId: z.string().optional(),
    visibility: z.enum(["PRIVATE", "CAMPAIGN"]).optional(),
  })
  .strict()
  .refine((d) => d.kind !== "ENTRY" || d.date !== undefined, {
    message: "date is required for an ENTRY",
    path: ["date"],
  });

const updateJournalSchema = z
  .object({
    date: dateSchema,
    body: z.string().min(1),
    visibility: z.enum(["PRIVATE", "CAMPAIGN"]),
  })
  .partial()
  .strict();

// Effective visibility for a write: outside a campaign there is nothing to
// share into, so coerce to PRIVATE (never error); inside one, default CAMPAIGN.
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

// The journal entries `userId` may read on `character`: the author's own
// entries only — a character's journal page never shows other members' notes.
// CAMPAIGN-visible entries surface elsewhere, on entity backlinks (the OR
// filter in routes/campaign/entities.ts GET …/backlinks).
export async function visibleEntries(
  db: Db,
  userId: string,
  character: { id: string; campaignId?: string | null },
) {
  return db.journalEntry.findMany({
    where: {
      characterId: character.id,
      // Own entries only by design — sharing happens on entity backlinks.
      authorUserId: userId,
    },
    orderBy: [{ date: "desc" }, { loggedAt: "desc" }, { createdAt: "desc" }],
  });
}

// Materialize @[<uuid>] tags in a body as JournalEntryRef rows (#248). A
// character outside any campaign stores its body verbatim with no refs; inside
// one, only tokens that resolve to a CampaignEntity in the SAME campaign survive
// (unknown/foreign ids are dropped). Runs inside the caller's transaction.
export async function syncEntryRefs(
  tx: Prisma.TransactionClient,
  characterId: string,
  entryId: string,
  body: string,
  userId: string,
) {
  // Fast path: a body with no @[uuid] tokens can only clear refs, so skip both
  // the character and membership lookups entirely (#489).
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

  // A non-owner can only tag revealed entities (#379): a UUID guess at a hidden
  // entity is dropped here so it never materializes a backlink that reveals it.
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
  return serializeCharacter(updated);
}

// ── POST /api/characters/:id/journal ─────────────────────────────────────────
// Create a new journal entry (ENTRY by default, or a fast NOTE).

journalRouter.post("/characters/:id/journal", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const data = parseBodyOr400(createJournalSchema, req.body, res);
  if (data === undefined) return;

  // A NOTE with no explicit session auto-attaches to the character's active
  // session (if one is running), so in-session capture lands on the right log.
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

// ── PATCH /api/characters/:id/journal/:entryId ───────────────────────────────
// Partial update of an existing entry.

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
    // Re-derive refs only when the body changed.
    if (data.body !== undefined) {
      await syncEntryRefs(tx, req.params.id, entry.id, data.body, req.user!.id);
    }
  });

  res.json(await serializeForCharacter(req.params.id));
});

// ── DELETE /api/characters/:id/journal/:entryId ──────────────────────────────
// Delete an entry.

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
