import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { serializeCharacter, characterInclude } from "./characters.js";

// Freeform campaign journal CRUD. Unlike inventory/HP/XP/spellcasting, journal
// entries carry no mechanical effect, so these are PLAIN REST routes: no audit
// log (logEvent), no undo, no transaction-op pattern. Each mutation writes
// directly to the JournalEntry table, then re-fetches the character with the
// standard include and returns the full serialized character (same response
// shape as every other character-mutating endpoint, so the frontend can swap
// its Character state in one assignment).

export const journalRouter = Router();

// `date` is a calendar date with no meaningful time-of-day. Accept ONLY the
// yyyy-mm-dd string the client's <input type="date"> produces and pin it to UTC
// midnight, so the stored value can never drift a day from what the user picked.
// (A bare z.coerce.date() would accept tz-offset datetimes like
// "2026-06-22T23:00:00-05:00" → stored 2026-06-23, displayed a day off.)
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD calendar date")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

const createJournalSchema = z
  .object({
    title: z.string().min(1),
    date: dateSchema,
    body: z.string().min(1),
    sessionId: z.string().optional(),
  })
  .strict();

const updateJournalSchema = z
  .object({
    title: z.string().min(1),
    date: dateSchema,
    body: z.string().min(1),
  })
  .partial()
  .strict();

async function serializeForCharacter(characterId: string) {
  const updated = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    include: characterInclude,
  });
  return serializeCharacter(updated);
}

// ── POST /api/characters/:id/journal ─────────────────────────────────────────
// Create a new journal entry.

journalRouter.post("/characters/:id/journal", async (req, res) => {
  const parseResult = createJournalSchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  await prisma.journalEntry.create({
    data: {
      characterId: character.id,
      title: parseResult.data.title,
      date: parseResult.data.date,
      body: parseResult.data.body,
      sessionId: parseResult.data.sessionId ?? null,
    },
  });

  res.status(201).json(await serializeForCharacter(character.id));
});

// ── PATCH /api/characters/:id/journal/:entryId ───────────────────────────────
// Partial update of an existing entry.

journalRouter.patch("/characters/:id/journal/:entryId", async (req, res) => {
  const parseResult = updateJournalSchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const entry = await prisma.journalEntry.findUnique({
    where: { id: req.params.entryId },
    select: { id: true, characterId: true },
  });
  if (!entry || entry.characterId !== character.id) {
    res.status(404).json({ error: "Journal entry not found" });
    return;
  }

  await prisma.journalEntry.update({
    where: { id: entry.id },
    data: parseResult.data,
  });

  res.json(await serializeForCharacter(character.id));
});

// ── DELETE /api/characters/:id/journal/:entryId ──────────────────────────────
// Delete an entry.

journalRouter.delete("/characters/:id/journal/:entryId", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const entry = await prisma.journalEntry.findUnique({
    where: { id: req.params.entryId },
    select: { id: true, characterId: true },
  });
  if (!entry || entry.characterId !== character.id) {
    res.status(404).json({ error: "Journal entry not found" });
    return;
  }

  await prisma.journalEntry.delete({ where: { id: entry.id } });

  res.json(await serializeForCharacter(character.id));
});
