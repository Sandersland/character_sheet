import { Router } from "express";

import { prisma } from "../lib/prisma.js";
import { startSession, endSession, getActiveSession, logCombatEvent, logRollEvent, SessionError, CombatError } from "../lib/sessions.js";
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
// Returns the currently-active session, or null (200) if none is active.
// 404 is reserved for an unknown character id.

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
  res.json(session ?? null);
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

  const journalEntries = await prisma.journalEntry.findMany({
    where: { sessionId: session.id },
    orderBy: { date: "desc" },
  });

  res.json({
    ...session,
    journalEntries,
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

// ── Combat lifecycle event routes ─────────────────────────────────────────────
//
// These routes only write audit log events — they do not mutate character state.
// POST /…/combat/start   — logs "combatStarted"
// POST /…/combat/end     — logs "combatEnded"
// POST /…/combat/round   — logs "combatRoundAdvanced" (body: { round: number })

async function resolveCombatCharacter(id: string, res: Parameters<Parameters<typeof sessionsRouter.post>[1]>[1]) {
  const character = await prisma.character.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!character) {
    res.status(404).json({ error: "Character not found" });
    return null;
  }
  return character;
}

sessionsRouter.post("/characters/:id/sessions/:sessionId/combat/start", async (req, res) => {
  const character = await resolveCombatCharacter(req.params.id, res);
  if (!character) return;
  try {
    await logCombatEvent(character.id, req.params.sessionId, "combatStarted");
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof CombatError) {
      const status = err.message.includes("not found") ? 404 : 409;
      res.status(status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

sessionsRouter.post("/characters/:id/sessions/:sessionId/combat/end", async (req, res) => {
  const character = await resolveCombatCharacter(req.params.id, res);
  if (!character) return;
  try {
    await logCombatEvent(character.id, req.params.sessionId, "combatEnded");
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof CombatError) {
      const status = err.message.includes("not found") ? 404 : 409;
      res.status(status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

sessionsRouter.post("/characters/:id/sessions/:sessionId/combat/round", async (req, res) => {
  const character = await resolveCombatCharacter(req.params.id, res);
  if (!character) return;
  const { round } = req.body as { round?: number };
  if (typeof round !== "number" || round < 1) {
    res.status(400).json({ error: "round must be a positive integer" });
    return;
  }
  try {
    await logCombatEvent(character.id, req.params.sessionId, "combatRoundAdvanced", { round });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof CombatError) {
      const status = err.message.includes("not found") ? 404 : 409;
      res.status(status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ── Roll event route ─────────────────────────────────────────────────────────
//
// POST /…/sessions/:sessionId/roll — log a single attack or damage roll from
// the session UI. The client computes the dice total; the backend formats the
// summary and persists the event tagged with the active session.

sessionsRouter.post("/characters/:id/sessions/:sessionId/roll", async (req, res) => {
  const character = await resolveCombatCharacter(req.params.id, res);
  if (!character) return;

  const { kind, source, total, specLabel, damageType, faces } = req.body as {
    kind?: unknown;
    source?: unknown;
    total?: unknown;
    specLabel?: unknown;
    damageType?: unknown;
    faces?: unknown;
  };

  if (kind !== "attack" && kind !== "damage") {
    res.status(400).json({ error: "kind must be 'attack' or 'damage'" });
    return;
  }
  if (typeof source !== "string" || source.trim() === "") {
    res.status(400).json({ error: "source must be a non-empty string" });
    return;
  }
  if (typeof total !== "number") {
    res.status(400).json({ error: "total must be a number" });
    return;
  }
  // faces is optional (back-compat); when present it must be an array of positive integers.
  if (
    faces !== undefined &&
    (!Array.isArray(faces) ||
      !faces.every((f) => typeof f === "number" && Number.isInteger(f) && f > 0))
  ) {
    res.status(400).json({ error: "faces must be an array of positive integers" });
    return;
  }

  try {
    await logRollEvent(character.id, req.params.sessionId, {
      kind,
      source,
      total,
      specLabel: typeof specLabel === "string" ? specLabel : undefined,
      damageType: typeof damageType === "string" ? damageType : undefined,
      faces: faces as number[] | undefined,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof CombatError) {
      const status = err.message.includes("not found") ? 404 : 409;
      res.status(status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
