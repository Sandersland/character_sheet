import { randomUUID } from "node:crypto";

import { logEvent, type EventType } from "@/lib/activity/events.js";
import { prisma } from "@/lib/core/prisma.js";
import { spellEconomyRestrictions } from "@/lib/spellcasting/spell-economy.js";
import { DEFAULT_RULES_EDITION, type RulesEdition } from "@/lib/rules/edition.js";
import {
  computeCampaignRecap,
  computeSessionSummary,
  type ParticipantSummary,
} from "./session-summary.js";
import type { Prisma, SpellCastKind } from "@/generated/prisma/client.js";
import type { CombatState } from "@character-sheet/shared-types";

// The central errorHandler reads `.status` on thrown errors; default 409 (conflict), pass 404 at not-found throw sites.
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

const SESSION_GRACE_MS = 60 * 60 * 1000;

// campaignPreferences rides along so the session UI can offer party-target healing only to allies who opted in (#462).
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

// Signature is load-bearing: threaded into every apply*Operations() lib to tag events.
export async function getActiveSessionId(
  characterId: string,
): Promise<string | null> {
  const session = await getActiveSession(characterId);
  return session?.id ?? null;
}

// Resolves through maybeAutoClose (via activeSessionForCampaign/activeSoloSessionForCharacter) so a stale session never reports as active.
export async function getActiveSession(characterId: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { campaignId: true },
  });
  if (!character) return null;
  if (character.campaignId) return activeSessionForCampaign(character.campaignId);
  return activeSoloSessionForCharacter(characterId);
}

export async function autoCloseIfStale(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: sessionWithParticipants,
  });
  if (session) await maybeAutoClose(session);
}

export async function activeSessionForCampaign(campaignId: string) {
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

async function maybeAutoClose(
  session: SessionWithParticipants,
): Promise<SessionWithParticipants> {
  if (session.status !== "active") return session;
  const endedAt = autoCloseEndTime(session.participants);
  if (!endedAt) return session;
  await closeSession(session, endedAt);
  return { ...session, status: "ended", endedAt };
}

function autoCloseEndTime(
  participants: SessionWithParticipants["participants"],
): Date | null {
  const emptiedByCharacterDeletion = participants.length === 0;
  if (emptiedByCharacterDeletion) return new Date();

  const everyoneLeft = participants.every((p) => p.leftAt !== null);
  if (!everyoneLeft) return null;

  const lastLeftMs = Math.max(...participants.map((p) => p.leftAt!.getTime()));
  const graceExpired = Date.now() - lastLeftMs >= SESSION_GRACE_MS;
  return graceExpired ? new Date(lastLeftMs + SESSION_GRACE_MS) : null;
}

// Idempotent — also called from applyExperienceOperations's retroactive recompute.
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
    // Filtering on status:"active" claims the close atomically: a concurrent end/auto-close that already flipped the row loses this match and skips the duplicate recompute + logs.
    // Also clears combat state (#1030 finding #5) — otherwise an ended session keeps serving its last-known round/combatActive forever.
    const { count } = await tx.session.updateMany({
      where: { id: session.id, status: "active" },
      data: { status: "ended", endedAt, combatActive: false, round: 0 },
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
    // Re-checked inside the tx so two concurrent starts can't both pass the pre-check above and create rival sessions.
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

// Invariant: at most one active solo session per character.
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
    // Re-checked inside the tx so two concurrent starts can't both pass the pre-check above and create rival solo sessions.
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

// On rejoin the prior leftAt is cleared so the participant keeps a single present interval.
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
    // A per-turn spell interlock stranded from a prior interval must not block a freshly-rejoined player (#1439 review).
    update: { leftAt: null, spellCastAsAction: null, spellCastAsBonus: null },
  });
}

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

// round/combatActive are the authoritative Session columns; spellEconomy is resolved via the shared rule fn spellEconomyRestrictions.
// updatedAt is the max of the session's and the participant's own, so the client's monotonic sync guard advances on a cast-only change too.
export type { CombatState };

async function readCombatColumns(
  db: Prisma.TransactionClient,
  sessionId: string,
  characterId: string,
): Promise<{
  round: number;
  combatActive: boolean;
  sessionUpdatedAt: Date;
  spellCastAsAction: SpellCastKind | null;
  spellCastAsBonus: SpellCastKind | null;
  participantUpdatedAt: Date | null;
  edition: RulesEdition;
} | null> {
  // ONE query so round/combatActive, the cast record, and edition come from a single committed snapshot — two separate findUniques could straddle a concurrent combat mutation and serve a torn state (#1439 review).
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: {
      round: true,
      combatActive: true,
      updatedAt: true,
      participants: {
        where: { characterId },
        select: {
          spellCastAsAction: true,
          spellCastAsBonus: true,
          updatedAt: true,
          character: { select: { rulesEdition: true } },
        },
        take: 1,
      },
    },
  });
  if (!session) return null;
  const participant = session.participants[0];
  return {
    round: session.round,
    combatActive: session.combatActive,
    sessionUpdatedAt: session.updatedAt,
    spellCastAsAction: participant?.spellCastAsAction ?? null,
    spellCastAsBonus: participant?.spellCastAsBonus ?? null,
    participantUpdatedAt: participant?.updatedAt ?? null,
    // A missing participant can't resolve an edition; fall back to the schema default so the flags stay well-defined.
    edition: participant?.character.rulesEdition ?? DEFAULT_RULES_EDITION,
  };
}

function toCombatState(cols: NonNullable<Awaited<ReturnType<typeof readCombatColumns>>>): CombatState {
  const updatedAt =
    cols.participantUpdatedAt && cols.participantUpdatedAt > cols.sessionUpdatedAt
      ? cols.participantUpdatedAt
      : cols.sessionUpdatedAt;
  return {
    round: cols.round,
    combatActive: cols.combatActive,
    // ISO string on the wire, matching the client's `updatedAt: string`.
    updatedAt: updatedAt.toISOString(),
    spellEconomy: spellEconomyRestrictions(cols.spellCastAsAction, cols.spellCastAsBonus, cols.edition),
  };
}

// Takes a TransactionClient so it works both inside a tx (combat mutations) and standalone (poll GET, passed the plain prisma client).
async function buildCombatState(
  db: Prisma.TransactionClient,
  sessionId: string,
  characterId: string,
): Promise<CombatState | null> {
  const cols = await readCombatColumns(db, sessionId, characterId);
  return cols ? toCombatState(cols) : null;
}

// The @updatedAt bump here is load-bearing: it advances the served CombatState's updatedAt so the client syncs the cleared flags past its own monotonic guard.
async function resetTurnSpellCast(
  tx: Prisma.TransactionClient,
  sessionId: string,
  characterId: string,
): Promise<void> {
  await tx.sessionParticipant.updateMany({
    where: { sessionId, characterId },
    data: { spellCastAsAction: null, spellCastAsBonus: null },
  });
}

// startCombat/endCombat are party-wide boundaries, so they reset every participant, not just the caller — scoping to the caller stranded another participant's stale block across a combat restart (#1439 review). advanceCombatRound stays per-character via resetTurnSpellCast.
async function resetAllTurnSpellCasts(tx: Prisma.TransactionClient, sessionId: string): Promise<void> {
  await tx.sessionParticipant.updateMany({
    where: { sessionId },
    data: { spellCastAsAction: null, spellCastAsBonus: null },
  });
}

// A record written while combatActive is false would linger and serve a spurious block once combat next starts (#1875 review), so this is a no-op unless combat is active.
// The `session: { combatActive: true }` filter is folded into the updateMany's own WHERE, not a separate read-then-write: under READ COMMITTED a concurrent endCombat between a preliminary read and the update would strand a stale interlock (TOCTOU).
// A cantrip write must NOT downgrade an existing `leveled` record for the same slot this turn — under Action Surge a leveled Action spell then a cantrip both cost the Action, and the cantrip must not lift the block.
export async function recordTurnSpellCast(
  tx: Prisma.TransactionClient,
  sessionId: string,
  characterId: string,
  economy: "action" | "bonus" | "reaction",
  kind: SpellCastKind,
): Promise<void> {
  if (economy === "reaction") return;
  if (economy === "action") {
    await tx.sessionParticipant.updateMany({
      // A bare `{ not: "leveled" }` would also exclude the null row (SQL NULL comparison), skipping the first cantrip cast — match null OR cantrip explicitly.
      where: kind === "cantrip"
        ? { sessionId, characterId, session: { combatActive: true }, OR: [{ spellCastAsAction: null }, { spellCastAsAction: "cantrip" }] }
        : { sessionId, characterId, session: { combatActive: true } },
      data: { spellCastAsAction: kind },
    });
  } else {
    await tx.sessionParticipant.updateMany({
      where: kind === "cantrip"
        ? { sessionId, characterId, session: { combatActive: true }, OR: [{ spellCastAsBonus: null }, { spellCastAsBonus: "cantrip" }] }
        : { sessionId, characterId, session: { combatActive: true } },
      data: { spellCastAsBonus: kind },
    });
  }
}

async function logCombatLifecycleEvent(
  characterId: string,
  sessionId: string,
  type: CombatEventType,
  round: number | undefined,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await logEvent(tx, {
    characterId,
    category: "combat",
    type: type as EventType,
    summary: COMBAT_SUMMARIES[type](round),
    batchId: randomUUID(),
    sessionId,
    data: round !== undefined ? { round } : null,
  });
}

// Idempotent: the updateMany({combatActive:false}) guard means a stale re-press can't reset a running round; no initiative order (#1030 scope) means any participant may call this concurrently.
export async function startCombat(characterId: string, sessionId: string): Promise<CombatState> {
  await assertActiveParticipant(sessionId, characterId);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.session.updateMany({
      where: { id: sessionId, combatActive: false },
      data: { combatActive: true, round: 1 },
    });
    // count>0 gates both the audit log and the turn-cast reset to the real false→true transition, so a no-op re-press can't re-log or clear an in-progress block (#1439 review).
    if (count > 0) {
      await logCombatLifecycleEvent(characterId, sessionId, "combatStarted", undefined, tx);
      await resetAllTurnSpellCasts(tx, sessionId);
    }
    return buildCombatStateOrThrow(tx, sessionId, characterId);
  });
}

// Idempotent for the same reason as startCombat: a stale second End Combat is a no-op, not a re-log.
export async function endCombat(characterId: string, sessionId: string): Promise<CombatState> {
  await assertActiveParticipant(sessionId, characterId);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.session.updateMany({
      where: { id: sessionId, combatActive: true },
      data: { combatActive: false, round: 0 },
    });
    if (count > 0) {
      await logCombatLifecycleEvent(characterId, sessionId, "combatEnded", undefined, tx);
      await resetAllTurnSpellCasts(tx, sessionId);
    }
    return buildCombatStateOrThrow(tx, sessionId, characterId);
  });
}

// THE ROUND NUMBER IS NEVER CLIENT INPUT (#1030): the server increments atomically (`round = round + 1`), so Postgres serializes concurrent same-instant end-turns instead of losing one to a read-then-write race.
// No initiative order yet (explicit non-goal this phase), so every end-turn call is its own +1 — this function can't distinguish two real turns from one call firing twice.
export async function advanceCombatRound(characterId: string, sessionId: string): Promise<CombatState> {
  await assertActiveParticipant(sessionId, characterId);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.session.updateMany({
      where: { id: sessionId, combatActive: true },
      data: { round: { increment: 1 } },
    });
    if (count === 0) throw new CombatError(`Session ${sessionId} is not in combat`);
    await resetTurnSpellCast(tx, sessionId, characterId);
    const state = await buildCombatStateOrThrow(tx, sessionId, characterId);
    await logCombatLifecycleEvent(characterId, sessionId, "combatRoundAdvanced", state.round, tx);
    return state;
  });
}

// The session is guaranteed to exist here (the mutations already updated it under the same tx) — a null return would be a programmer error, not a client one.
async function buildCombatStateOrThrow(
  tx: Prisma.TransactionClient,
  sessionId: string,
  characterId: string,
): Promise<CombatState> {
  const state = await buildCombatState(tx, sessionId, characterId);
  if (!state) throw new CombatError(`Session not found: ${sessionId}`, 404);
  return state;
}

// No participant gate here — the route checks the caller is a session participant.
export async function getCombatState(
  sessionId: string,
  characterId: string,
): Promise<CombatState | null> {
  return buildCombatState(prisma, sessionId, characterId);
}
