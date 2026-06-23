import { randomUUID } from "node:crypto";

import { logEvent, type EventType } from "./events.js";
import { prisma } from "./prisma.js";
import { computeSessionSummary } from "./session-summary.js";
import type { Prisma } from "../generated/prisma/client.js";

export class SessionError extends Error {}
export class CombatError extends Error {}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the id of the currently-active session for a character, or null if
 * none is active. Used by domain libs to tag logEvent calls.
 */
export async function getActiveSessionId(
  characterId: string,
): Promise<string | null> {
  const session = await prisma.session.findFirst({
    where: { characterId, status: "active" },
    select: { id: true },
  });
  return session?.id ?? null;
}

/**
 * Returns the full active session row, or null.
 */
export async function getActiveSession(characterId: string) {
  return prisma.session.findFirst({
    where: { characterId, status: "active" },
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Starts a new play session for a character. Rejects if one is already active
 * (at most one active session per character). Returns the new session row.
 */
export async function startSession(
  characterId: string,
  title?: string,
) {
  const existing = await getActiveSession(characterId);
  if (existing) {
    throw new SessionError(
      `A session is already active (id: ${existing.id}). End it before starting a new one.`,
    );
  }

  const batchId = randomUUID();

  return prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: { characterId, title: title ?? null },
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
 * Ends the given session, setting status → ended and endedAt. Logs a
 * sessionEnded event. Throws if the session doesn't exist or isn't active.
 */
export async function endSession(
  characterId: string,
  sessionId: string,
) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, characterId: true, status: true, startedAt: true },
  });

  if (!session || session.characterId !== characterId) {
    throw new SessionError(`Session not found: ${sessionId}`);
  }
  if (session.status !== "active") {
    throw new SessionError(`Session ${sessionId} is already ended`);
  }

  const batchId = randomUUID();
  const endedAt = new Date();

  // Aggregate the session's event log into a typed summary. Read the events
  // BEFORE logging `sessionEnded` so that meta-event isn't part of the window.
  const events = await prisma.characterEvent.findMany({
    where: { sessionId: session.id },
    select: { type: true, reverted: true, before: true, after: true, data: true },
    orderBy: { createdAt: "asc" },
  });

  const summary = computeSessionSummary(events, {
    startedAt: session.startedAt,
    endedAt,
  });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.session.update({
      where: { id: sessionId },
      data: {
        status: "ended",
        endedAt,
        summary: summary as unknown as Prisma.InputJsonValue,
      },
    });

    await logEvent(tx, {
      characterId,
      category: "session",
      type: "sessionEnded",
      summary: "Session ended",
      batchId,
      sessionId,
    });

    return updated;
  });
}

// ── Combat event logging ───────────────────────────────────────────────────────

type CombatEventType = "combatStarted" | "combatEnded" | "combatRoundAdvanced";

const COMBAT_SUMMARIES: Record<CombatEventType, (round?: number) => string> = {
  combatStarted: () => "Combat started",
  combatEnded: () => "Combat ended",
  combatRoundAdvanced: (round) => `Round ${round ?? 2} began`,
};

/**
 * Logs a single attack or damage roll from the session UI against the given
 * session. The client computes the dice total and spec label; the backend
 * formats the human-readable summary and persists the event. Does not mutate
 * any character state — it's a pure log entry.
 */
export async function logRollEvent(
  characterId: string,
  sessionId: string,
  params: {
    kind: "attack" | "damage";
    source: string;
    total: number;
    specLabel?: string;
    damageType?: string;
  },
) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, characterId: true, status: true },
  });

  if (!session || session.characterId !== characterId) {
    throw new CombatError(`Session not found: ${sessionId}`);
  }
  if (session.status !== "active") {
    throw new CombatError(`Session ${sessionId} is not active`);
  }

  const { kind, source, total, specLabel, damageType } = params;
  const batchId = randomUUID();

  const summary =
    kind === "attack"
      ? `${source}: ${total}${specLabel ? ` (${specLabel})` : ""}`
      : `${source}: ${total}${damageType ? ` ${damageType}` : ""}${specLabel ? ` (${specLabel})` : ""}`;

  return prisma.$transaction(async (tx) => {
    await logEvent(tx, {
      characterId,
      category: "combat",
      type: kind === "attack" ? "attackRoll" : "damageRoll",
      summary,
      batchId,
      sessionId,
      data: { kind, source, total, specLabel: specLabel ?? null, damageType: damageType ?? null },
    });
  });
}

/**
 * Logs a combat lifecycle event (started / ended / round advanced) against the
 * given session. Validates that the character and session exist. Does not mutate
 * any character state — it's a pure log entry.
 */
export async function logCombatEvent(
  characterId: string,
  sessionId: string,
  type: CombatEventType,
  opts?: { round?: number },
) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, characterId: true, status: true },
  });

  if (!session || session.characterId !== characterId) {
    throw new CombatError(`Session not found: ${sessionId}`);
  }
  if (session.status !== "active") {
    throw new CombatError(`Session ${sessionId} is not active`);
  }

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
