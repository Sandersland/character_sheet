import { Router } from "express";
import { patchSessionSchema, type PatchSessionInput } from "@character-sheet/contracts";

import type { CampaignRole } from "@/generated/prisma/client.js";
import { serializeActivityEvent } from "@/lib/activity/activity.js";
import { assertCampaignMembership, assertCharacterAccess } from "@/lib/auth/access.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";
import {
  startCampaignSession,
  startSoloSession,
  endSession,
  joinSession,
  leaveSession,
  getActiveSession,
  autoCloseIfStale,
  startCombat,
  endCombat,
  advanceCombatRound,
  getCombatState,
  SessionError,
} from "@/lib/session/sessions.js";
import { getSessionDoorway } from "@/lib/session/doorway.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { requireCharacterId } from "./session-route-helpers.js";

export const sessionsRouter = Router();

// Assumes the character's existence has already been checked.
async function assertCharacterInCampaign(characterId: string, campaignId: string): Promise<void> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { campaignId: true },
  });
  if (!character || character.campaignId !== campaignId) {
    throw new SessionError(`Character is not part of this campaign`);
  }
}

async function assertSessionInCampaign(sessionId: string, campaignId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { campaignId: true },
  });
  if (!session || session.campaignId !== campaignId) {
    throw new SessionError(`Session not found: ${sessionId}`, 404);
  }
}

// A campaign session — even one the character is in — is invisible to the solo routes, so it 404s here too.
async function assertSoloSessionForCharacter(sessionId: string, characterId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { campaignId: true, participants: { where: { characterId }, select: { id: true } } },
  });
  if (!session || session.campaignId !== null || session.participants.length === 0) {
    throw new SessionError(`Session not found: ${sessionId}`, 404);
  }
}

/** POST /api/campaigns/:campaignId/sessions — starts a shared session with the given character as first participant; 409 if one is already active. Returns { session, character }. */
sessionsRouter.post(
  "/campaigns/:campaignId/sessions",
  async (req, res) => {
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
    res.status(201).json({ session, character: await serializeCharacter(updated) });
  },
);

/** POST /api/campaigns/:campaignId/sessions/:sessionId/join — adds (or re-adds) the caller's character to the active session. */
sessionsRouter.post(
  "/campaigns/:campaignId/sessions/:sessionId/join",
  async (req, res) => {
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
  },
);

/** POST /api/campaigns/:campaignId/sessions/:sessionId/leave — records that the caller's character left; the session stays open for others. */
sessionsRouter.post(
  "/campaigns/:campaignId/sessions/:sessionId/leave",
  async (req, res) => {
    await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");
    const characterId = requireCharacterId(req, res);
    if (characterId === null) return;
    await assertCharacterAccess(prisma, req.user!.id, characterId, "edit");

    await assertSessionInCampaign(req.params.sessionId, req.params.campaignId);
    const participant = await leaveSession(req.params.sessionId, characterId);
    res.json({ participant });
  },
);

/** POST /api/campaigns/:campaignId/sessions/:sessionId/end — ends the shared session; any campaign member may end it, including an OWNER with no character in the session (force-end). */
sessionsRouter.post(
  "/campaigns/:campaignId/sessions/:sessionId/end",
  async (req, res) => {
    await assertCampaignMembership(prisma, req.user!.id, req.params.campaignId, "view");

    await assertSessionInCampaign(req.params.sessionId, req.params.campaignId);
    const session = await endSession(req.params.sessionId);
    res.json({ session });
  },
);

/** GET /api/campaigns/:campaignId/sessions — session history newest-first, with a derived (non-persisted) sessionNumber and arcId. `?characterId=` (must be the caller's own) adds that character's noteCount per session; a foreign characterId 403s. */
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

  // sessionNumber is 1-based by startedAt ascending; since `sessions` is ordered descending, the ascending rank at descending index i (0 = newest) is `total - i`.
  const total = sessions.length;
  res.json(
    sessions.map((s, i) => ({
      ...s,
      sessionNumber: total - i,
      noteCount: noteCountById.get(s.id) ?? 0,
    })),
  );
});

// patchSessionSchema's exported type is z.input — the whole-object `.refine()` doesn't diverge input from output.
type PatchSessionData = PatchSessionInput;

// A status + message a helper hands back for the route to send, or null to proceed.
type PatchDenial = { status: number; error: string };

// Deliberately NOT filtered to `leftAt: null`: chapter titles are edited after the session has ended, when every participant's `leftAt` is set.
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

async function arcIsInCampaign(campaignId: string, arcId: string): Promise<boolean> {
  const arc = await prisma.campaignArc.findUnique({
    where: { id: arcId },
    select: { campaignId: true },
  });
  return arc !== null && arc.campaignId === campaignId;
}

// Assumes the caller has already asserted membership and passes the resolved `role` in, so this never throws — only returns a denial or null to proceed.
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

/** PATCH /api/campaigns/:campaignId/sessions/:sessionId — `{ title }` needs the caller to own a participant character; `{ arcId }` is OWNER-only and the arc must belong to the campaign. Sending both requires satisfying both gates. */
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

/** GET /api/campaigns/:campaignId/sessions/:sessionId — session detail with participants, events (newest first), and journal entries; runs autoCloseIfStale first. */
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

  res.json({ ...session, journalEntries, events: events.map(serializeActivityEvent) });
});

/** GET /api/characters/:id/sessions — sessions this character participated in, newest first; powers the activity log's session filter. */
sessionsRouter.get("/characters/:id/sessions", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  const sessions = await prisma.session.findMany({
    where: { participants: { some: { characterId: req.params.id } } },
    orderBy: { startedAt: "desc" },
  });

  res.json(sessions);
});

/** POST /api/characters/:id/sessions — starts a solo (campaignId-null) session; 409 if the character is in a campaign or already has an active solo session. Returns { session, character }. */
sessionsRouter.post("/characters/:id/sessions", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
  const { title } = req.body as { title?: string };
  const session = await startSoloSession(req.params.id, title);
  const updated = await prisma.character.findUniqueOrThrow({
    where: { id: req.params.id },
    include: characterInclude,
  });
  res.status(201).json({ session, character: await serializeCharacter(updated) });
});

/** POST /api/characters/:id/sessions/:sessionId/end — ends the character's solo session (end-only, no solo join/leave); 404 unless it's a campaignId-null session the character is in, 409 if already ended. */
sessionsRouter.post("/characters/:id/sessions/:sessionId/end", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
  await assertSoloSessionForCharacter(req.params.sessionId, req.params.id);
  const session = await endSession(req.params.sessionId);
  res.json({ session });
});

/** GET /api/characters/:id/sessions/active — the active session for the character's campaign, or null (200) when there's no campaign or no active session. */
sessionsRouter.get("/characters/:id/sessions/active", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");
  const session = await getActiveSession(req.params.id);
  res.json(session ?? null);
});

// Must precede the `:sessionId` route so "doorway" isn't captured as an id.
/** GET /api/characters/:id/sessions/doorway — the live/join/start state the SessionDoorway bar renders; solo characters get campaignId: null. */
sessionsRouter.get("/characters/:id/sessions/doorway", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");
  res.json(await getSessionDoorway(req.params.id, req.user!.id));
});

/** GET /api/characters/:id/sessions/:sessionId — single-session detail; the character must participate in the session. */
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

  res.json({ ...session, journalEntries, events: events.map(serializeActivityEvent) });
});

// Combat lifecycle routes: server-authoritative mutations of Session.combatActive/round. combat/round ignores any client-sent round field — the server always decides the next round.
sessionsRouter.post(
  "/characters/:id/sessions/:sessionId/combat/start",
  async (req, res) => {
    await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
    res.status(201).json(await startCombat(req.params.id, req.params.sessionId));
  },
);

sessionsRouter.post(
  "/characters/:id/sessions/:sessionId/combat/end",
  async (req, res) => {
    await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
    res.status(201).json(await endCombat(req.params.id, req.params.sessionId));
  },
);

sessionsRouter.post(
  "/characters/:id/sessions/:sessionId/combat/round",
  async (req, res) => {
    await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");
    res.status(201).json(await advanceCombatRound(req.params.id, req.params.sessionId));
  },
);

/** GET /api/characters/:id/sessions/:sessionId/combat — cheap combat-state poll (round/combatActive/updatedAt only); 404 unless the character ever participated, 409 once the session has ended or this participant has left. */
sessionsRouter.get("/characters/:id/sessions/:sessionId/combat", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  const participant = await prisma.sessionParticipant.findUnique({
    where: { sessionId_characterId: { sessionId: req.params.sessionId, characterId: req.params.id } },
    select: { leftAt: true, session: { select: { status: true } } },
  });
  if (!participant) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (participant.session.status !== "active" || participant.leftAt !== null) {
    res.status(409).json({ error: "Session is not active" });
    return;
  }

  const state = await getCombatState(req.params.sessionId, req.params.id);
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(state);
});

