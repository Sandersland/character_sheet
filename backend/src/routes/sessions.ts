import { Router } from "express";

import { prisma } from "../lib/prisma.js";
import { startSession, endSession, getActiveSession, SessionError } from "../lib/sessions.js";
import { serializeCharacter, characterInclude } from "./characters.js";

export const sessionsRouter = Router();

// ── POST /api/characters/:id/sessions ────────────────────────────────────────
//
// Start a new play session. Rejects with 409 if one is already active.
// Returns { session, character } — the new session row and the full serialized
// character so the frontend can navigate to the session view immediately.

sessionsRouter.post("/characters/:id/sessions", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const { title } = req.body as { title?: string };

  try {
    const session = await startSession(character.id, title);

    const updated = await prisma.character.findUniqueOrThrow({
      where: { id: character.id },
      include: characterInclude,
    });

    res.status(201).json({ session, character: serializeCharacter(updated) });
  } catch (err) {
    if (err instanceof SessionError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ── POST /api/characters/:id/sessions/:sessionId/end ─────────────────────────
//
// End the given session. Rejects if the session doesn't exist, doesn't belong
// to this character, or is already ended.

sessionsRouter.post("/characters/:id/sessions/:sessionId/end", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  try {
    const session = await endSession(character.id, req.params.sessionId);
    res.json({ session });
  } catch (err) {
    if (err instanceof SessionError) {
      const status = err.message.includes("not found") ? 404 : 409;
      res.status(status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ── GET /api/characters/:id/sessions ─────────────────────────────────────────
//
// List all sessions for a character, newest first.

sessionsRouter.get("/characters/:id/sessions", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const sessions = await prisma.session.findMany({
    where: { characterId: character.id },
    orderBy: { startedAt: "desc" },
  });

  res.json(sessions);
});

// ── GET /api/characters/:id/sessions/active ───────────────────────────────────
//
// Returns the currently-active session, or 404 if none is active.

sessionsRouter.get("/characters/:id/sessions/active", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const session = await getActiveSession(character.id);
  if (!session) {
    res.status(404).json({ error: "No active session" });
    return;
  }

  res.json(session);
});

// ── GET /api/characters/:id/sessions/:sessionId ───────────────────────────────
//
// Get one session with its events (newest first), reusing the activity
// serialization shape.

sessionsRouter.get("/characters/:id/sessions/:sessionId", async (req, res) => {
  const character = await prisma.character.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const session = await prisma.session.findUnique({
    where: { id: req.params.sessionId },
  });
  if (!session || session.characterId !== character.id) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const events = await prisma.characterEvent.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    ...session,
    events: events.map((row) => ({
      id: row.id,
      category: row.category,
      type: row.type,
      summary: row.summary,
      entityType: row.entityType ?? undefined,
      entityId: row.entityId ?? undefined,
      before: row.before ?? undefined,
      after: row.after ?? undefined,
      data: row.data ?? undefined,
      actor: row.actor,
      reverted: row.reverted,
      batchId: row.batchId ?? undefined,
      createdAt: row.createdAt,
    })),
  });
});
