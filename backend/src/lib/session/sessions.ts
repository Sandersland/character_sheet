import { randomUUID } from "node:crypto";

import { logEvent, type EventType } from "@/lib/activity/events.js";
import { prisma } from "@/lib/core/prisma.js";
import {
  computeCampaignRecap,
  computeSessionSummary,
  type ParticipantSummary,
} from "./session-summary.js";
import type { Prisma } from "@/generated/prisma/client.js";

// Session/combat domain errors carry the HTTP status the central `errorHandler`
// maps. Default 409 (conflict — wrong session state / not a participant); pass
// 404 at the not-found throw sites so callers don't sniff the message for it.
export class SessionError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}
export class CombatError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

// Auto-close an active session this long after the last participant leaves.
const SESSION_GRACE_MS = 60 * 60 * 1000;

// Standard include for reads that need participant presence + character names.
// campaignPreferences rides along so the session UI can offer party-target
// healing only to allies who opted in (#462); resolved per session.campaignId.
const sessionWithParticipants = {
  participants: {
    include: {
      character: {
        select: {
          id: true,
          name: true,
          campaignPreferences: { select: { campaignId: true, autoFriendlyHealing: true } },
        },
      },
    },
  },
} as const;

type SessionWithParticipants = Prisma.SessionGetPayload<{
  include: typeof sessionWithParticipants;
}>;

/**
 * Returns the id of the campaign's currently-active session for a character, or
 * null if the character is in no campaign / no session is active. Signature is
 * load-bearing: threaded into every apply*Operations() lib to tag events.
 */
export async function getActiveSessionId(
  characterId: string,
): Promise<string | null> {
  const session = await getActiveSession(characterId);
  return session?.id ?? null;
}

/**
 * Returns the character's active session (row + participants), or null. A
 * character in a campaign resolves the campaign's active session; a campaign-less
 * character resolves its own active solo session (#1080). Runs maybeAutoClose so
 * a stale session never reports as active.
 */
export async function getActiveSession(characterId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { campaignId: true },
  });
  if (!character) return null;
  if (character.campaignId) return activeSessionForCampaign(character.campaignId);
  return activeSoloSessionForCharacter(characterId);
}

/**
 * Loads a session and runs maybeAutoClose so a stale one settles before a read.
 * No-op when the session is unknown or already ended.
 */
export async function autoCloseIfStale(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: sessionWithParticipants,
  });
  if (session) await maybeAutoClose(session);
}

async function activeSessionForCampaign(campaignId: string) {
  const session = await prisma.session.findFirst({
    where: { campaignId, status: "active" },
    include: sessionWithParticipants,
  });
  if (!session) return null;
  const checked = await maybeAutoClose(session);
  return checked.status === "active" ? checked : null;
}

async function activeSoloSessionForCharacter(characterId: string) {
  const session = await prisma.session.findFirst({
    where: { campaignId: null, status: "active", participants: { some: { characterId } } },
    include: sessionWithParticipants,
  });
  if (!session) return null;
  const checked = await maybeAutoClose(session);
  return checked.status === "active" ? checked : null;
}

/**
 * Closes an active session whose every participant left at least SESSION_GRACE_MS
 * ago, dating endedAt to max(leftAt) + grace. Reused on every active-session read
 * so an abandoned session settles itself without an explicit end.
 */
async function maybeAutoClose(
  session: SessionWithParticipants,
): Promise<SessionWithParticipants> {
  if (session.status !== "active") return session;
  const { participants } = session;
  if (participants.length === 0) return session;
  if (!participants.every((p) => p.leftAt !== null)) return session;

  const maxLeftMs = Math.max(...participants.map((p) => p.leftAt!.getTime()));
  if (Date.now() - maxLeftMs < SESSION_GRACE_MS) return session;

  const endedAt = new Date(maxLeftMs + SESSION_GRACE_MS);
  await closeSession(session, endedAt);
  return { ...session, status: "ended", endedAt };
}

/**
 * Recomputes every participant's summary + the campaign recap from the session's
 * events and persists them, inside the given transaction. Idempotent — used by
 * both session-close and the retroactive-XP recompute.
 */
export async function recomputeSummaries(
  tx: Prisma.TransactionClient,
  session: SessionWithParticipants,
): Promise<ParticipantSummary[]> {
  const fallbackEnd = session.endedAt ?? new Date();
  const summaries: ParticipantSummary[] = [];

  for (const p of session.participants) {
    const events = await tx.characterEvent.findMany({
      where: {
        sessionId: session.id,
        characterId: p.characterId,
        type: { not: "sessionEnded" },
      },
      select: { type: true, reverted: true, before: true, after: true, data: true },
      orderBy: { createdAt: "asc" },
    });
    const leftAt = p.leftAt ?? fallbackEnd;
    const base = computeSessionSummary(events, { startedAt: p.joinedAt, endedAt: leftAt });
    const summary: ParticipantSummary = {
      ...base,
      characterId: p.characterId,
      characterName: p.character.name,
      joinedAt: p.joinedAt.toISOString(),
      leftAt: p.leftAt ? p.leftAt.toISOString() : null,
      presentMs: Math.max(0, leftAt.getTime() - p.joinedAt.getTime()),
    };
    summaries.push(summary);
    await tx.sessionParticipant.update({
      where: { id: p.id },
      data: { summary: summary as unknown as Prisma.InputJsonValue },
    });
  }

  const recap = computeCampaignRecap(summaries);
  await tx.session.update({
    where: { id: session.id },
    data: { summary: recap as unknown as Prisma.InputJsonValue },
  });
  return summaries;
}

async function closeSession(
  session: SessionWithParticipants,
  endedAt: Date,
): Promise<void> {
  const batchId = randomUUID();
  await prisma.$transaction(async (tx) => {
    // Claim the close atomically: a concurrent end/auto-close that already flipped
    // the row to "ended" matches no rows here, so the loser skips the duplicate
    // summary recompute + sessionEnded logs.
    const { count } = await tx.session.updateMany({
      where: { id: session.id, status: "active" },
      data: { status: "ended", endedAt },
    });
    if (count === 0) return;
    await recomputeSummaries(tx, { ...session, endedAt });
    for (const p of session.participants) {
      await logEvent(tx, {
        characterId: p.characterId,
        category: "session",
        type: "sessionEnded",
        summary: "Session ended",
        batchId,
        sessionId: session.id,
      });
    }
  });
}

async function assertActiveParticipant(
  sessionId: string,
  characterId: string,
): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true },
  });
  if (!session) throw new CombatError(`Session not found: ${sessionId}`, 404);
  if (session.status !== "active") throw new CombatError(`Session ${sessionId} is not active`);

  const participant = await prisma.sessionParticipant.findUnique({
    where: { sessionId_characterId: { sessionId, characterId } },
    select: { leftAt: true },
  });
  if (!participant || participant.leftAt !== null) {
    throw new CombatError(`Character is not an active participant of session ${sessionId}`);
  }
}

/**
 * Starts a new shared session for a campaign with `characterId` as the first
 * participant. Rejects if a session is already active for the campaign.
 */
export async function startCampaignSession(
  campaignId: string,
  characterId: string,
  title?: string,
) {
  const existing = await activeSessionForCampaign(campaignId);
  if (existing) {
    throw new SessionError(
      `A session is already active (id: ${existing.id}). End it before starting a new one.`,
    );
  }

  const batchId = randomUUID();
  return prisma.$transaction(async (tx) => {
    // Authoritative guard: re-check inside the tx so two concurrent starts can't
    // both pass the pre-check above and create rival sessions.
    const conflict = await tx.session.findFirst({
      where: { campaignId, status: "active" },
      select: { id: true },
    });
    if (conflict) {
      throw new SessionError(
        `A session is already active (id: ${conflict.id}). End it before starting a new one.`,
      );
    }

    const session = await tx.session.create({
      data: {
        campaignId,
        title: title ?? null,
        participants: { create: { characterId } },
      },
      include: sessionWithParticipants,
    });

    await logEvent(tx, {
      characterId,
      category: "session",
      type: "sessionStarted",
      summary: title ? `Session started: ${title}` : "Session started",
      batchId,
      sessionId: session.id,
    });

    return session;
  });
}

/**
 * Starts a character-scoped solo session (campaignId null) with `characterId` as
 * its sole participant (#1080). Rejects a character that belongs to a campaign
 * (use startCampaignSession) and a character that already has an active solo
 * session. Invariant: at most one active solo session per character.
 */
export async function startSoloSession(characterId: string, title?: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { campaignId: true },
  });
  if (!character) throw new SessionError(`Character not found: ${characterId}`, 404);
  if (character.campaignId) {
    throw new SessionError(
      "Character belongs to a campaign; start a campaign session instead.",
    );
  }

  const existing = await activeSoloSessionForCharacter(characterId);
  if (existing) {
    throw new SessionError(
      `A solo session is already active (id: ${existing.id}). End it before starting a new one.`,
    );
  }

  const batchId = randomUUID();
  return prisma.$transaction(async (tx) => {
    // Authoritative guard: re-check inside the tx so two concurrent starts can't
    // both pass the pre-check above and create rival solo sessions.
    const conflict = await tx.session.findFirst({
      where: { campaignId: null, status: "active", participants: { some: { characterId } } },
      select: { id: true },
    });
    if (conflict) {
      throw new SessionError(
        `A solo session is already active (id: ${conflict.id}). End it before starting a new one.`,
      );
    }

    const session = await tx.session.create({
      data: {
        title: title ?? null,
        participants: { create: { characterId } },
      },
      include: sessionWithParticipants,
    });

    await logEvent(tx, {
      characterId,
      category: "session",
      type: "sessionStarted",
      summary: title ? `Session started: ${title}` : "Session started",
      batchId,
      sessionId: session.id,
    });

    return session;
  });
}

/**
 * Adds (or re-adds) a character to an active session. On rejoin the prior
 * leftAt is cleared so the participant keeps a single present interval.
 */
export async function joinSession(sessionId: string, characterId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true },
  });
  if (!session) throw new SessionError(`Session not found: ${sessionId}`, 404);
  if (session.status !== "active") throw new SessionError(`Session ${sessionId} is not active`);

  return prisma.sessionParticipant.upsert({
    where: { sessionId_characterId: { sessionId, characterId } },
    create: { sessionId, characterId },
    update: { leftAt: null },
  });
}

/**
 * Marks a participant as having left now. The session stays open for the rest of
 * the party; it auto-closes once everyone has left for the grace period.
 */
export async function leaveSession(sessionId: string, characterId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  if (!session) throw new SessionError(`Session not found: ${sessionId}`, 404);
  if (session.status !== "active") throw new SessionError(`Session ${sessionId} is not active`);

  const participant = await prisma.sessionParticipant.findUnique({
    where: { sessionId_characterId: { sessionId, characterId } },
    select: { id: true, leftAt: true },
  });
  if (!participant) {
    throw new SessionError(`Character is not a participant of session ${sessionId}`);
  }
  // Don't overwrite an existing leftAt — a double-leave would push the auto-close timer later.
  if (participant.leftAt !== null) {
    throw new SessionError(`Character has already left session ${sessionId}`);
  }
  return prisma.sessionParticipant.update({
    where: { id: participant.id },
    data: { leftAt: new Date() },
  });
}

/**
 * Ends a session: computes + persists each participant's summary and the
 * campaign recap, sets status/endedAt, and logs sessionEnded per participant.
 * Returns the ended session with participants + its journal entries.
 */
export async function endSession(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: sessionWithParticipants,
  });
  if (!session) throw new SessionError(`Session not found: ${sessionId}`, 404);
  if (session.status !== "active") throw new SessionError(`Session ${sessionId} is already ended`);

  await closeSession(session, new Date());

  const updated = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: sessionWithParticipants,
  });
  const journalEntries = await prisma.journalEntry.findMany({
    where: { sessionId },
    orderBy: { date: "desc" },
  });
  return { ...updated, journalEntries };
}

type CombatEventType = "combatStarted" | "combatEnded" | "combatRoundAdvanced";

const COMBAT_SUMMARIES: Record<CombatEventType, (round?: number) => string> = {
  combatStarted: () => "Combat started",
  combatEnded: () => "Combat ended",
  combatRoundAdvanced: (round) => `Round ${round ?? 2} began`,
};

export type RollKind = "attack" | "damage" | "check" | "save" | "initiative";
export type RollMode = "normal" | "advantage" | "disadvantage";

const ROLL_EVENT_TYPES: Record<RollKind, EventType> = {
  attack: "attackRoll",
  damage: "damageRoll",
  check: "checkRoll",
  save: "saveRoll",
  initiative: "initiativeRoll",
};

interface LogRollParams {
  kind: RollKind;
  source: string;
  total: number;
  specLabel?: string;
  damageType?: string;
  /** Raw kept die faces (non-dropped), e.g. [12] for 1d20 or [3, 5] for 2d6. */
  faces?: number[];
  /** Ability key for check/save/initiative rolls (already a display-resolved source). */
  ability?: string;
  /** Skill key for check rolls. */
  skill?: string;
  /** Target difficulty class, when the roll is made against one. */
  dc?: number;
  /** Advantage state the d20 was rolled with. */
  rollMode?: RollMode;
}

function buildRollSummary(params: LogRollParams): string {
  const { kind, source, total, specLabel, damageType, dc } = params;
  if (kind === "damage") {
    return `${source}: ${total}${damageType ? ` ${damageType}` : ""}${specLabel ? ` (${specLabel})` : ""}`;
  }
  const dcSuffix = dc !== undefined ? ` vs DC ${dc}` : "";
  return `${source}: ${total}${dcSuffix}${specLabel ? ` (${specLabel})` : ""}`;
}

/**
 * Logs a single roll (attack / damage / check / save / initiative) from the
 * session UI. The caller must be an active participant of an active session.
 * Pure log entry — no state mutation, and non-undoable (before/after null).
 */
export async function logRollEvent(
  characterId: string,
  sessionId: string,
  params: LogRollParams,
) {
  await assertActiveParticipant(sessionId, characterId);

  const { kind, source, total, specLabel, damageType, faces, ability, skill, dc, rollMode } = params;
  const batchId = randomUUID();

  return prisma.$transaction(async (tx) => {
    await logEvent(tx, {
      characterId,
      category: "roll",
      type: ROLL_EVENT_TYPES[kind],
      summary: buildRollSummary(params),
      batchId,
      sessionId,
      data: {
        kind,
        source,
        total,
        specLabel: specLabel ?? null,
        damageType: damageType ?? null,
        faces: faces ?? null,
        ability: ability ?? null,
        skill: skill ?? null,
        dc: dc ?? null,
        rollMode: rollMode ?? null,
      },
    });
  });
}

/**
 * Logs a combat lifecycle event (started / ended / round advanced). The caller
 * must be an active participant of an active session. Pure log entry.
 */
export async function logCombatEvent(
  characterId: string,
  sessionId: string,
  type: CombatEventType,
  opts?: { round?: number },
) {
  await assertActiveParticipant(sessionId, characterId);

  const batchId = randomUUID();
  const summary = COMBAT_SUMMARIES[type](opts?.round);

  return prisma.$transaction(async (tx) => {
    await logEvent(tx, {
      characterId,
      category: "combat",
      type: type as EventType,
      summary,
      batchId,
      sessionId,
      data: opts?.round !== undefined ? { round: opts.round } : null,
    });
  });
}
