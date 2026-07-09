import { Router } from "express";

import { assertCampaignMembership, assertCharacterAccess } from "../../lib/auth/access.js";
import { prisma } from "../../lib/prisma.js";
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
} from "../../lib/sessions.js";
import { characterInclude } from "../../lib/character-include.js";
import { serializeCharacter } from "../../lib/character-serialize.js";
import { parseRollInput, requireCharacterId, withSessionErrors } from "./session-route-helpers.js";

export const sessionsRouter = Router();

// Campaign-level sessions (#245): one shared session per play night that party
// members join/leave. Campaign-scoped routes are gated by assertCampaignMembership;
// the character-scoped reads the SessionPage polls stay for back-compat.

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

sessionsRouter.post(
  "/campaigns/:campaignId/sessions",
  withSessionErrors(async (req, res) => {
    await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");
    const characterId = requireCharacterId(req, res);
    if (characterId === null) return;
    const { title } = req.body as { title?: string };
    await assertCharacterAccess(prisma, req.user!.id, characterId, "edit");

    await assertCharacterInCampaign(characterId, req.params.campaignId);
    const session = await startCampaignSession(req.params.campaignId, characterId, title);
    const updated = await prisma.character.findUniqueOrThrow({
      where: { id: characterId },
      include: characterInclude,
    });
    res.status(201).json({ session, character: serializeCharacter(updated) });
  }),
);

// ── POST /api/campaigns/:campaignId/sessions/:sessionId/join ───────────────────
// Add (or re-add) the caller's character to the active session.

sessionsRouter.post(
  "/campaigns/:campaignId/sessions/:sessionId/join",
  withSessionErrors(async (req, res) => {
    await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");
    const characterId = requireCharacterId(req, res);
    if (characterId === null) return;
    await assertCharacterAccess(prisma, req.user!.id, characterId, "edit");

    await assertSessionInCampaign(req.params.sessionId, req.params.campaignId);
    await assertCharacterInCampaign(characterId, req.params.campaignId);
    // 201 only on first join; a rejoin updates an existing row, so 200.
    const existing = await prisma.sessionParticipant.findUnique({
      where: { sessionId_characterId: { sessionId: req.params.sessionId, characterId } },
      select: { id: true },
    });
    const participant = await joinSession(req.params.sessionId, characterId);
    res.status(existing ? 200 : 201).json({ participant });
  }),
);

// ── POST /api/campaigns/:campaignId/sessions/:sessionId/leave ──────────────────
// Record that the caller's character left; the session stays open for others.

sessionsRouter.post(
  "/campaigns/:campaignId/sessions/:sessionId/leave",
  withSessionErrors(async (req, res) => {
    await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");
    const characterId = requireCharacterId(req, res);
    if (characterId === null) return;
    await assertCharacterAccess(prisma, req.user!.id, characterId, "edit");

    await assertSessionInCampaign(req.params.sessionId, req.params.campaignId);
    const participant = await leaveSession(req.params.sessionId, characterId);
    res.json({ participant });
  }),
);

// ── POST /api/campaigns/:campaignId/sessions/:sessionId/end ────────────────────
// End the shared session. Any campaign member may end it (an OWNER can do so even
// without a character in the session — the role is surfaced for that force-end).

sessionsRouter.post(
  "/campaigns/:campaignId/sessions/:sessionId/end",
  withSessionErrors(async (req, res) => {
    await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");

    await assertSessionInCampaign(req.params.sessionId, req.params.campaignId);
    const session = await endSession(req.params.sessionId);
    res.json({ session });
  }),
);

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

// ── GET /api/characters/:id/sessions ──────────────────────────────────────────
// Sessions this character participated in, newest first — powers the activity
// log's session filter. Character-scoped (gated by assertCharacterAccess).

sessionsRouter.get("/characters/:id/sessions", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  const sessions = await prisma.session.findMany({
    where: { participants: { some: { characterId: req.params.id } } },
    orderBy: { startedAt: "desc" },
  });

  res.json(sessions);
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

sessionsRouter.post(
  "/characters/:id/sessions/:sessionId/combat/start",
  withSessionErrors(async (req, res) => {
    await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
    await logCombatEvent(req.params.id, req.params.sessionId, "combatStarted");
    res.status(201).json({ ok: true });
  }),
);

sessionsRouter.post(
  "/characters/:id/sessions/:sessionId/combat/end",
  withSessionErrors(async (req, res) => {
    await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
    await logCombatEvent(req.params.id, req.params.sessionId, "combatEnded");
    res.status(201).json({ ok: true });
  }),
);

sessionsRouter.post(
  "/characters/:id/sessions/:sessionId/combat/round",
  withSessionErrors(async (req, res) => {
    await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
    const { round } = req.body as { round?: number };
    if (typeof round !== "number" || round < 1) {
      res.status(400).json({ error: "round must be a positive integer" });
      return;
    }
    await logCombatEvent(req.params.id, req.params.sessionId, "combatRoundAdvanced", { round });
    res.status(201).json({ ok: true });
  }),
);

// ── Roll event route (character-scoped) ───────────────────────────────────────

sessionsRouter.post(
  "/characters/:id/sessions/:sessionId/roll",
  withSessionErrors(async (req, res) => {
    await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
    const roll = parseRollInput(req, res);
    if (roll === null) return;
    await logRollEvent(req.params.id, req.params.sessionId, roll);
    res.status(201).json({ ok: true });
  }),
);

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
