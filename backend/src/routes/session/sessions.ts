import { Router } from "express";
import { z } from "zod";

import type { CampaignRole } from "@/generated/prisma/client.js";
import { assertCampaignMembership, assertCharacterAccess } from "@/lib/auth/access.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";
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
} from "@/lib/session/sessions.js";
import { getSessionDoorway } from "@/lib/session/doorway.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
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

/**
 * POST /api/campaigns/:campaignId/sessions
 * Start a shared session with the given character as first participant. 409 if a
 * session is already active for the campaign. Returns { session, character }.
 */
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

/**
 * POST /api/campaigns/:campaignId/sessions/:sessionId/join
 * Add (or re-add) the caller's character to the active session.
 */
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

/**
 * POST /api/campaigns/:campaignId/sessions/:sessionId/leave
 * Record that the caller's character left; the session stays open for others.
 */
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

/**
 * POST /api/campaigns/:campaignId/sessions/:sessionId/end
 * End the shared session. Any campaign member may end it (an OWNER can do so even
 * without a character in the session — the role is surfaced for that force-end).
 */
sessionsRouter.post(
  "/campaigns/:campaignId/sessions/:sessionId/end",
  withSessionErrors(async (req, res) => {
    await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");

    await assertSessionInCampaign(req.params.sessionId, req.params.campaignId);
    const session = await endSession(req.params.sessionId);
    res.json({ session });
  }),
);

/**
 * GET /api/campaigns/:campaignId/sessions
 * Session history for the campaign, newest first, with participants. This is the
 * journal "chronicle" read surface (#863): every row also carries a DERIVED
 * `sessionNumber` (1-based by startedAt ASCENDING within the campaign — never a
 * persisted column) and its `arcId`. Pass `?characterId=<id>` (one of the
 * caller's own characters) to also get that character's `noteCount` per session;
 * without it `noteCount` is 0. Membership gates the list (a member sees every
 * session of their campaign); a characterId that isn't the caller's own 403s.
 */
sessionsRouter.get("/campaigns/:campaignId/sessions", async (req, res) => {
  await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");

  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  if (characterId !== undefined) {
    await assertCharacterAccess(prisma, req.user!.id, characterId, "view");
  }

  const sessions = await prisma.session.findMany({
    where: { campaignId: req.params.campaignId },
    orderBy: { startedAt: "desc" },
    include: { participants: { include: { character: { select: { id: true, name: true } } } } },
  });

  const noteCountById = new Map<string, number>();
  if (characterId !== undefined && sessions.length > 0) {
    const grouped = await prisma.journalEntry.groupBy({
      by: ["sessionId"],
      where: { characterId, sessionId: { in: sessions.map((s) => s.id) } },
      _count: { _all: true },
    });
    for (const g of grouped) {
      if (g.sessionId !== null) noteCountById.set(g.sessionId, g._count._all);
    }
  }

  // Derive the 1-based chapter number by startedAt ASCENDING. `sessions` is
  // already ordered DESCENDING, so the ascending rank of the row at descending
  // index `i` (0 = newest) is `total - i` — a single-pass arithmetic read (no
  // map lookup, so the value is provably defined). One active session per
  // campaign means startedAt values are strictly increasing, so the reverse
  // index is exact with no tie ambiguity.
  const total = sessions.length;
  res.json(
    sessions.map((s, i) => ({
      ...s,
      sessionNumber: total - i,
      noteCount: noteCountById.get(s.id) ?? 0,
    })),
  );
});

const patchSessionSchema = z
  .object({
    title: z.string().min(1).nullable().optional(),
    arcId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.arcId !== undefined, {
    message: "Provide at least one of title or arcId",
  });

type PatchSessionData = z.infer<typeof patchSessionSchema>;

// A status + message a helper hands back for the route to send, or null to proceed.
type PatchDenial = { status: number; error: string };

// The caller is a participant iff they own a character joined to the session.
// NOTE: deliberately NOT filtered to `leftAt: null` (present participants only).
// Chapter titles are edited from the journal page AFTER the session has ended,
// when every participant's `leftAt` is set — restricting to still-present players
// would break the primary use case (naming a chapter after the fact). So a former
// participant of a closed session may still title it; that is intended.
async function callerOwnsParticipant(userId: string, sessionId: string): Promise<boolean> {
  const participant = await prisma.sessionParticipant.findFirst({
    where: { sessionId, character: { ownerId: userId } },
    select: { id: true },
  });
  return participant !== null;
}

async function sessionBelongsToCampaign(sessionId: string, campaignId: string): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { campaignId: true },
  });
  return session !== null && session.campaignId === campaignId;
}

// A non-null arcId must resolve to an arc in the same campaign.
async function arcIsInCampaign(campaignId: string, arcId: string): Promise<boolean> {
  const arc = await prisma.campaignArc.findUnique({
    where: { id: arcId },
    select: { campaignId: true },
  });
  return arc !== null && arc.campaignId === campaignId;
}

// Per-field authorization for the session PATCH: arcId is owner-only (and the arc
// must be in the campaign); title needs the caller to be a participant. Returns a
// denial uniformly for every failure — the caller has already asserted membership
// and passes the resolved `role` in, so this never throws — or null to proceed.
async function authorizeSessionPatch(
  role: CampaignRole,
  userId: string,
  campaignId: string,
  sessionId: string,
  data: PatchSessionData,
): Promise<PatchDenial | null> {
  if (data.arcId !== undefined) {
    if (role !== "OWNER") {
      return { status: 403, error: "Only the campaign owner may assign a session to an arc" };
    }
    if (data.arcId !== null && !(await arcIsInCampaign(campaignId, data.arcId))) {
      return { status: 404, error: "Arc not found" };
    }
  }
  if (data.title !== undefined && !(await callerOwnsParticipant(userId, sessionId))) {
    return { status: 403, error: "Only a session participant may edit the session title" };
  }
  return null;
}

// Only the fields the PATCH actually sent, so an unsent field stays untouched.
function sessionPatchUpdate(data: PatchSessionData) {
  return {
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.arcId !== undefined ? { arcId: data.arcId } : {}),
  };
}

/**
 * PATCH /api/campaigns/:campaignId/sessions/:sessionId
 * Two distinct edits share this path, each with its own authorization (#863):
 *   • `{ title }`  — any session PARTICIPANT (a caller who owns a character in
 *     the session) may set/rename the chapter title after the fact. Historically
 *     title was only settable at session start (startCampaignSession).
 *   • `{ arcId }`  — OWNER-only: file the session under an arc (or null to
 *     un-file). The arc must belong to the same campaign.
 * Sending both requires satisfying both gates. Membership is the floor.
 */
sessionsRouter.patch("/campaigns/:campaignId/sessions/:sessionId", async (req, res) => {
  const { campaignId, sessionId } = req.params;
  const { role } = await assertCampaignMembership(prisma, req.user!.id, campaignId, "view");

  if (!(await sessionBelongsToCampaign(sessionId, campaignId))) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const data = parseBodyOr400(patchSessionSchema, req.body, res);
  if (data === undefined) return;

  const denial = await authorizeSessionPatch(role, req.user!.id, campaignId, sessionId, data);
  if (denial) {
    res.status(denial.status).json({ error: denial.error });
    return;
  }

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: sessionPatchUpdate(data),
    include: { participants: { include: { character: { select: { id: true, name: true } } } } },
  });
  res.json(updated);
});

/**
 * GET /api/campaigns/:campaignId/sessions/:sessionId
 * Session detail with participants, events (newest first), and journal entries.
 * Runs maybeAutoClose so a stale active session settles before the read.
 */
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

/**
 * GET /api/characters/:id/sessions
 * Sessions this character participated in, newest first — powers the activity
 * log's session filter. Character-scoped (gated by assertCharacterAccess).
 */
sessionsRouter.get("/characters/:id/sessions", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  const sessions = await prisma.session.findMany({
    where: { participants: { some: { characterId: req.params.id } } },
    orderBy: { startedAt: "desc" },
  });

  res.json(sessions);
});

/**
 * GET /api/characters/:id/sessions/active
 * The active session for the character's campaign, or null (200) when there's no
 * campaign / no active session. 404 only for an unknown character id.
 */
sessionsRouter.get("/characters/:id/sessions/active", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");
  const session = await getActiveSession(req.params.id);
  res.json(session ?? null);
});

/**
 * GET /api/characters/:id/sessions/doorway
 * The sheet's session-doorway read model (#942): one state-aware fact set the
 * SessionDoorway bar renders (live/join/start now; scheduled kinds after #951).
 * Settles a stale session on read (getSessionDoorway → getActiveSession →
 * autoCloseIfStale). Character-scoped read; solo characters get campaignId: null.
 * NOTE: must precede the `:sessionId` route so "doorway" isn't captured as an id.
 */
sessionsRouter.get("/characters/:id/sessions/doorway", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");
  res.json(await getSessionDoorway(req.params.id, req.user!.id));
});

/**
 * GET /api/characters/:id/sessions/:sessionId
 * Single-session detail the SessionPage loads. The character must participate in
 * the session (so it stays a character-owned read).
 */
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

/**
 * Combat lifecycle event routes (character-scoped): write-only audit log
 * entries — no character-state mutation. The lib validates the caller is an
 * active participant of an active session.
 */
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

/** POST /api/characters/:id/sessions/:sessionId/roll — logs a roll event (character-scoped). */
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
