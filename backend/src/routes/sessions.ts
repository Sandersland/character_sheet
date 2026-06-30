import { Router } from "express";

import { assertCampaignMembership, assertCharacterAccess } from "../lib/auth/access.js";
import { prisma } from "../lib/prisma.js";
import {
  startCampaignSession,
  endSession,
  joinSession,
  leaveSession,
  getActiveSession,
  autoCloseIfStale,
  logCombatEvent,
  logRollEvent,
  SessionError,
  CombatError,
} from "../lib/sessions.js";
import { serializeCharacter, characterInclude } from "./characters.js";

export const sessionsRouter = Router();

// Campaign-level sessions (#245): one shared session per play night that party
// members join/leave. Campaign-scoped routes are gated by assertCampaignMembership;
// the character-scoped reads the SessionPage polls stay for back-compat.

function sessionErrorStatus(message: string): number {
  return message.includes("not found") ? 404 : 409;
}

// Confirms the character is attached to the campaign (so a session only ever
// gathers that campaign's characters). Assumes existence already checked.
async function assertCharacterInCampaign(characterId: string, campaignId: string): Promise<void> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { campaignId: true },
  });
  if (!character || character.campaignId !== campaignId) {
    throw new SessionError(`Character is not part of this campaign`);
  }
}

// Verifies a session exists and belongs to the campaign; throws 404 otherwise.
async function assertSessionInCampaign(sessionId: string, campaignId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { campaignId: true },
  });
  if (!session || session.campaignId !== campaignId) {
    throw new SessionError(`Session not found: ${sessionId}`);
  }
}

// ── POST /api/campaigns/:campaignId/sessions ──────────────────────────────────
// Start a shared session with the given character as first participant. 409 if a
// session is already active for the campaign. Returns { session, character }.

sessionsRouter.post("/campaigns/:campaignId/sessions", async (req, res) => {
  await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");
  const { characterId, title } = req.body as { characterId?: string; title?: string };
  if (typeof characterId !== "string" || characterId.trim() === "") {
    res.status(400).json({ error: "characterId is required" });
    return;
  }
  await assertCharacterAccess(prisma, req.user!.id, characterId, "edit");

  try {
    await assertCharacterInCampaign(characterId, req.params.campaignId);
    const session = await startCampaignSession(req.params.campaignId, characterId, title);
    const updated = await prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      include: characterInclude,
    });
    res.status(201).json({ session, character: serializeCharacter(updated) });
  } catch (err) {
    if (err instanceof SessionError) {
      res.status(sessionErrorStatus(err.message)).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ── POST /api/campaigns/:campaignId/sessions/:sessionId/join ───────────────────
// Add (or re-add) the caller's character to the active session.

sessionsRouter.post("/campaigns/:campaignId/sessions/:sessionId/join", async (req, res) => {
  await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");
  const { characterId } = req.body as { characterId?: string };
  if (typeof characterId !== "string" || characterId.trim() === "") {
    res.status(400).json({ error: "characterId is required" });
    return;
  }
  await assertCharacterAccess(prisma, req.user!.id, characterId, "edit");

  try {
    await assertSessionInCampaign(req.params.sessionId, req.params.campaignId);
    await assertCharacterInCampaign(characterId, req.params.campaignId);
    const participant = await joinSession(req.params.sessionId, characterId);
    res.status(201).json({ participant });
  } catch (err) {
    if (err instanceof SessionError) {
      res.status(sessionErrorStatus(err.message)).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ── POST /api/campaigns/:campaignId/sessions/:sessionId/leave ──────────────────
// Record that the caller's character left; the session stays open for others.

sessionsRouter.post("/campaigns/:campaignId/sessions/:sessionId/leave", async (req, res) => {
  await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");
  const { characterId } = req.body as { characterId?: string };
  if (typeof characterId !== "string" || characterId.trim() === "") {
    res.status(400).json({ error: "characterId is required" });
    return;
  }
  await assertCharacterAccess(prisma, req.user!.id, characterId, "edit");

  try {
    await assertSessionInCampaign(req.params.sessionId, req.params.campaignId);
    const participant = await leaveSession(req.params.sessionId, characterId);
    res.json({ participant });
  } catch (err) {
    if (err instanceof SessionError) {
      res.status(sessionErrorStatus(err.message)).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ── POST /api/campaigns/:campaignId/sessions/:sessionId/end ────────────────────
// End the shared session. Any campaign member may end it (an OWNER can do so even
// without a character in the session — the role is surfaced for that force-end).

sessionsRouter.post("/campaigns/:campaignId/sessions/:sessionId/end", async (req, res) => {
  await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");

  try {
    await assertSessionInCampaign(req.params.sessionId, req.params.campaignId);
    const session = await endSession(req.params.sessionId);
    res.json({ session });
  } catch (err) {
    if (err instanceof SessionError) {
      res.status(sessionErrorStatus(err.message)).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ── GET /api/campaigns/:campaignId/sessions ───────────────────────────────────
// Session history for the campaign, newest first, with participants.

sessionsRouter.get("/campaigns/:campaignId/sessions", async (req, res) => {
  await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");

  const sessions = await prisma.session.findMany({
    where: { campaignId: req.params.campaignId },
    orderBy: { startedAt: "desc" },
    include: { participants: { include: { character: { select: { id: true, name: true } } } } },
  });

  res.json(sessions);
});

// ── GET /api/campaigns/:campaignId/sessions/:sessionId ─────────────────────────
// Session detail with participants, events (newest first), and journal entries.
// Runs maybeAutoClose so a stale active session settles before the read.

sessionsRouter.get("/campaigns/:campaignId/sessions/:sessionId", async (req, res) => {
  await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");
  try {
    await assertSessionInCampaign(req.params.sessionId, req.params.campaignId);
  } catch {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  await autoCloseIfStale(req.params.sessionId);

  const session = await prisma.session.findUniqueOrThrow({
    where: { id: req.params.sessionId },
    include: { participants: { include: { character: { select: { id: true, name: true } } } } },
  });
  const events = await prisma.characterEvent.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
  });
  const journalEntries = await prisma.journalEntry.findMany({
    where: { sessionId: session.id },
    orderBy: { date: "desc" },
  });

  res.json({ ...session, journalEntries, events: events.map(serializeEvent) });
});

// ── GET /api/characters/:id/sessions/active ───────────────────────────────────
// The active session for the character's campaign, or null (200) when there's no
// campaign / no active session. 404 only for an unknown character id.

sessionsRouter.get("/characters/:id/sessions/active", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");
  const session = await getActiveSession(req.params.id);
  res.json(session ?? null);
});

// ── GET /api/characters/:id/sessions/:sessionId ───────────────────────────────
// Single-session detail the SessionPage loads. The character must participate in
// the session (so it stays a character-owned read).

sessionsRouter.get("/characters/:id/sessions/:sessionId", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  await autoCloseIfStale(req.params.sessionId);

  const session = await prisma.session.findUnique({
    where: { id: req.params.sessionId },
    include: { participants: { include: { character: { select: { id: true, name: true } } } } },
  });
  if (!session || !session.participants.some((p) => p.characterId === req.params.id)) {
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

  res.json({ ...session, journalEntries, events: events.map(serializeEvent) });
});

// ── Combat lifecycle event routes (character-scoped) ──────────────────────────
// Write-only audit log entries — no character-state mutation. The lib validates
// the caller is an active participant of an active session.

sessionsRouter.post("/characters/:id/sessions/:sessionId/combat/start", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
  try {
    await logCombatEvent(req.params.id, req.params.sessionId, "combatStarted");
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof CombatError) {
      res.status(sessionErrorStatus(err.message)).json({ error: err.message });
      return;
    }
    throw err;
  }
});

sessionsRouter.post("/characters/:id/sessions/:sessionId/combat/end", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
  try {
    await logCombatEvent(req.params.id, req.params.sessionId, "combatEnded");
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof CombatError) {
      res.status(sessionErrorStatus(err.message)).json({ error: err.message });
      return;
    }
    throw err;
  }
});

sessionsRouter.post("/characters/:id/sessions/:sessionId/combat/round", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
  const { round } = req.body as { round?: number };
  if (typeof round !== "number" || round < 1) {
    res.status(400).json({ error: "round must be a positive integer" });
    return;
  }
  try {
    await logCombatEvent(req.params.id, req.params.sessionId, "combatRoundAdvanced", { round });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof CombatError) {
      res.status(sessionErrorStatus(err.message)).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ── Roll event route (character-scoped) ───────────────────────────────────────

sessionsRouter.post("/characters/:id/sessions/:sessionId/roll", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

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
  if (
    faces !== undefined &&
    (!Array.isArray(faces) ||
      !faces.every((f) => typeof f === "number" && Number.isInteger(f) && f > 0))
  ) {
    res.status(400).json({ error: "faces must be an array of positive integers" });
    return;
  }

  try {
    await logRollEvent(req.params.id, req.params.sessionId, {
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
      res.status(sessionErrorStatus(err.message)).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Shared event serialization for session detail reads.
function serializeEvent(row: {
  id: string;
  category: string;
  type: string;
  summary: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  data: unknown;
  actor: string;
  reverted: boolean;
  batchId: string | null;
  createdAt: Date;
}) {
  return {
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
  };
}
