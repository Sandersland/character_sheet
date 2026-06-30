import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "../lib/auth/access.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { getActiveSessionId } from "../lib/sessions.js";
import { serializeCharacter, characterInclude } from "./characters.js";

// Freeform campaign journal CRUD. Unlike inventory/HP/XP/spellcasting, journal
// entries carry no mechanical effect, so these are PLAIN REST routes: no audit
// log (logEvent), no undo, no transaction-op pattern. Each mutation writes
// directly to the JournalEntry table, then re-fetches the character with the
// standard include and returns the full serialized character (same response
// shape as every other character-mutating endpoint, so the frontend can swap
// its Character state in one assignment).
//
// Two kinds share the table: full ENTRY rows (3-field title/date/body form) and
// fast NOTE rows (one-line in-session capture, no title). Entries are private by
// default (authorUserId + visibility) so sharing can be switched on later.

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

// title is required for ENTRY (the 3-field form) but omitted for a NOTE; date is
// required for ENTRY but defaults to today for a NOTE.
const createJournalSchema = z
  .object({
    kind: z.enum(["NOTE", "ENTRY"]).default("ENTRY"),
    title: z.string().min(1).optional(),
    date: dateSchema.optional(),
    body: z.string().min(1),
    sessionId: z.string().optional(),
  })
  .strict()
  .refine((d) => d.kind !== "ENTRY" || (d.title?.length ?? 0) > 0, {
    message: "title is required for an ENTRY",
    path: ["title"],
  })
  .refine((d) => d.kind !== "ENTRY" || d.date !== undefined, {
    message: "date is required for an ENTRY",
    path: ["date"],
  });

const updateJournalSchema = z
  .object({
    title: z.string().min(1),
    date: dateSchema,
    body: z.string().min(1),
  })
  .partial()
  .strict();

// The journal entries `userId` may read on `character`. v1 == private-by-default:
// only the author's own entries. Routing reads through one helper means the
// deferred campaign-sharing slice has a single seam to widen.
export async function visibleEntries(
  db: Db,
  userId: string,
  character: { id: string; campaignId?: string | null },
) {
  return db.journalEntry.findMany({
    where: {
      characterId: character.id,
      // Private-by-default: own entries only. CAMPAIGN-visible branch (inert): a
      // later slice OR-s in { visibility: "CAMPAIGN", character: { campaignId } }.
      authorUserId: userId,
    },
    orderBy: [{ date: "desc" }, { loggedAt: "desc" }, { createdAt: "desc" }],
  });
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

  const parseResult = createJournalSchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const data = parseResult.data;

  // A NOTE with no explicit session auto-attaches to the character's active
  // session (if one is running), so in-session capture lands on the right log.
  let sessionId = data.sessionId ?? null;
  if (data.kind === "NOTE" && !sessionId) {
    sessionId = await getActiveSessionId(req.params.id);
  }

  await prisma.journalEntry.create({
    data: {
      characterId: req.params.id,
      kind: data.kind,
      title: data.title ?? null,
      date: data.date ?? utcMidnightToday(),
      body: data.body,
      visibility: "PRIVATE",
      authorUserId: req.user!.id,
      sessionId,
    },
  });

  res.status(201).json(await serializeForCharacter(req.params.id));
});

// ── PATCH /api/characters/:id/journal/:entryId ───────────────────────────────
// Partial update of an existing entry.

journalRouter.patch("/characters/:id/journal/:entryId", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = updateJournalSchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const entry = await prisma.journalEntry.findUnique({
    where: { id: req.params.entryId },
    select: { id: true, characterId: true },
  });
  if (!entry || entry.characterId !== req.params.id) {
    res.status(404).json({ error: "Journal entry not found" });
    return;
  }

  await prisma.journalEntry.update({
    where: { id: entry.id },
    data: parseResult.data,
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
