import { randomUUID } from "node:crypto";

import { logEvent, type EventType } from "@/lib/activity/events.js";
import { prisma } from "@/lib/core/prisma.js";
import { spellEconomyRestrictions } from "@/lib/spellcasting/spell-economy.js";
import {
  computeCampaignRecap,
  computeSessionSummary,
  type ParticipantSummary,
} from "./session-summary.js";
import type { Prisma, SpellCastKind } from "@/generated/prisma/client.js";
import type {
  CombatState,
  RollEventAttackComponents,
  RollEventDamageComponents,
  RollEventKind,
  RollEventMode,
  RollEventModeSource,
  RollEventVerdict,
} from "@character-sheet/shared-types";

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
 * Returns the id of the character's currently-active session (campaign or
 * solo), or null if no session is active. Signature is load-bearing: threaded
 * into every apply*Operations() lib to tag events.
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
    // summary recompute + sessionEnded logs. Also clears combat state (#1030
    // finding #5) — without this an ended session kept serving its last-known
    // round/combatActive forever (the GET poll has no other gate on staleness).
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

// Aliased (not redeclared) from the shared wire type (#1235/#820) — kept as
// short local names because both RollInput and LogRollParams use them.
export type RollKind = RollEventKind;
export type RollMode = RollEventMode;

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
  /** Non-kept d20 face(s) of an advantage/disadvantage roll (#1359). */
  droppedFaces?: number[];
  /** Ability key for check/save/initiative rolls (already a display-resolved source). */
  ability?: string;
  /** Skill key for check rolls. */
  skill?: string;
  /** Target difficulty class, when the roll is made against one. */
  dc?: number;
  /** Advantage state the d20 was rolled with. */
  rollMode?: RollMode;
  // #1235 combat-log decomposition fields — see RollEventData for the
  // field-by-field rationale. target/outcome are deliberately absent (never
  // accepted here, never persisted) — see logRollEvent's `data` object below.
  swingId?: string;
  verdict?: RollEventVerdict;
  nat20?: boolean;
  nat1?: boolean;
  crit?: boolean;
  modeSources?: RollEventModeSource[];
  attackComponents?: RollEventAttackComponents;
  damageComponents?: RollEventDamageComponents;
}

function buildRollSummary(params: LogRollParams): string {
  const { kind, source, total, specLabel, damageType, dc } = params;
  if (kind === "damage") {
    return `${source}: ${total}${damageType ? ` ${damageType}` : ""}${specLabel ? ` (${specLabel})` : ""}`;
  }
  const dcSuffix = dc !== undefined ? ` vs DC ${dc}` : "";
  return `${source}: ${total}${dcSuffix}${specLabel ? ` (${specLabel})` : ""}`;
}

// Optional wire field -> persisted JSON value: undefined becomes null (a JSON
// column can't hold undefined), so every unset LogRollParams field still
// stores as an explicit null rather than an omitted key. Shared by every
// rollData field below (#1359) so logRollEvent's own branch count doesn't
// grow by one per optional field — the backend CI health step ratchets that
// ceiling (#1235).
function nullish<T>(value: T | undefined): T | null {
  return value ?? null;
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

  const {
    kind, source, total, specLabel, damageType, faces, droppedFaces, ability, skill, dc, rollMode,
    swingId, verdict, nat20, nat1, crit, modeSources, attackComponents, damageComponents,
  } = params;
  const batchId = randomUUID();

  // Hoisted out of the transaction call so building this object doesn't count
  // toward $transaction's callback's cyclomatic complexity (#1235).
  // target/outcome are NEVER written here — see LogRollParams' comment
  // (#1235 reserves them on the wire type for a future target/outcome
  // feature; the engine has no enemy/target model to populate them from).
  const rollData = {
    kind,
    source,
    total,
    specLabel: nullish(specLabel),
    damageType: nullish(damageType),
    faces: nullish(faces),
    droppedFaces: nullish(droppedFaces),
    ability: nullish(ability),
    skill: nullish(skill),
    dc: nullish(dc),
    rollMode: nullish(rollMode),
    swingId: nullish(swingId),
    verdict: nullish(verdict),
    nat20: nullish(nat20),
    nat1: nullish(nat1),
    crit: nullish(crit),
    modeSources: nullish(modeSources),
    attackComponents: nullish(attackComponents),
    damageComponents: nullish(damageComponents),
  };

  return prisma.$transaction(async (tx) => {
    await logEvent(tx, {
      characterId,
      category: "roll",
      type: ROLL_EVENT_TYPES[kind],
      summary: buildRollSummary(params),
      batchId,
      sessionId,
      data: rollData,
    });
  });
}

// Combat state read out of Session (#1030) + the acting participant's per-turn
// spell interlock (#1439) — the shape every combat lifecycle mutation returns,
// and what the cheap poll GET serves. `round`/`combatActive` are the
// authoritative Session columns (see the Session model's why-comment);
// `spellEconomy` is resolved from the participant's per-turn cast record via the
// one shared rule fn (spellEconomyRestrictions). This is the wire `CombatState`
// (shared-types) — `updatedAt` is the max of the session's and the participant's
// own so the client's monotonic sync guard advances on a cast (participant-only
// change) as well as a round change.
export type { CombatState };

// The columns behind a served CombatState — Session's round/combatActive/
// updatedAt and, for the acting character, the participant's per-turn cast
// record + its updatedAt (#1439).
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
} | null> {
  // ONE query so round/combatActive and the participant's cast record come from
  // a single committed snapshot (#1439 review): two separate findUniques could
  // straddle a concurrent combat mutation and serve a torn state. The nested
  // participant read is filtered to the acting character (the include is a join
  // in one round-trip, not a second statement).
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: {
      round: true,
      combatActive: true,
      updatedAt: true,
      participants: {
        where: { characterId },
        select: { spellCastAsAction: true, spellCastAsBonus: true, updatedAt: true },
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
  };
}

// Assemble the wire CombatState from the read columns: resolve the interlock via
// the shared rule fn and take the freshest `updatedAt` of session/participant.
function toCombatState(cols: NonNullable<Awaited<ReturnType<typeof readCombatColumns>>>): CombatState {
  const updatedAt =
    cols.participantUpdatedAt && cols.participantUpdatedAt > cols.sessionUpdatedAt
      ? cols.participantUpdatedAt
      : cols.sessionUpdatedAt;
  return {
    round: cols.round,
    combatActive: cols.combatActive,
    // ISO string on the wire, matching the client's `updatedAt: string` — the
    // existing Session.updatedAt contract.
    updatedAt: updatedAt.toISOString(),
    spellEconomy: spellEconomyRestrictions(cols.spellCastAsAction, cols.spellCastAsBonus),
  };
}

// Read + assemble a session's CombatState for the acting character (#1439). The
// combat lifecycle mutations call this after their update inside the same tx;
// the poll GET calls it standalone.
async function buildCombatState(
  db: Prisma.TransactionClient,
  sessionId: string,
  characterId: string,
): Promise<CombatState | null> {
  const cols = await readCombatColumns(db, sessionId, characterId);
  return cols ? toCombatState(cols) : null;
}

// Clear the acting participant's per-turn spell-cast record (#1439) — every turn
// boundary (startCombat/endCombat/advanceCombatRound) resets the interlock, the
// server-side twin of the client reducer's `spellCastThisTurn: {}` resets. The
// @updatedAt bump this triggers is load-bearing: it advances the served
// CombatState's `updatedAt` so a client that ended its turn syncs the cleared
// flags past its own monotonic guard.
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

/**
 * Record what a spell resolution cast in its economy slot this turn (#1439), so
 * the bonus-action interlock resolves server-side. Called from the resolveAction
 * transaction for a spell op (entryId present) whose character is in an active
 * session. `economy` is the op's cost kind; a reaction cast never restricts the
 * action/bonus economy, so it is not recorded. `kind` is leveled iff a slot was
 * spent (a cantrip has no slotLevel) — the only distinction the interlock reads.
 */
export async function recordTurnSpellCast(
  tx: Prisma.TransactionClient,
  sessionId: string,
  characterId: string,
  economy: "action" | "bonus" | "reaction",
  kind: SpellCastKind,
): Promise<void> {
  if (economy === "reaction") return;
  await tx.sessionParticipant.updateMany({
    where: { sessionId, characterId },
    data: economy === "action" ? { spellCastAsAction: kind } : { spellCastAsBonus: kind },
  });
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

/**
 * Starts combat: sets combatActive=true and round=1 (a fresh encounter always
 * begins at round 1). Idempotent — guarded by `updateMany({combatActive:
 * false})` — so a second participant re-pressing Start Combat while combat is
 * already live cannot stomp a running round back to 1; there's no initiative
 * order (#1030 scope) to say only one participant "owns" starting combat, so
 * any of them may call this concurrently. The audit event only fires on the
 * real false→true transition, never on a no-op re-press.
 */
export async function startCombat(characterId: string, sessionId: string): Promise<CombatState> {
  await assertActiveParticipant(sessionId, characterId);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.session.updateMany({
      where: { id: sessionId, combatActive: false },
      data: { combatActive: true, round: 1 },
    });
    // Gate BOTH side-effects on the real false→true transition (count > 0): a
    // no-op re-press while combat is already live must not log a second
    // combatStarted NOR clear a valid in-progress bonus-action block (#1439
    // review). A fresh encounter starts every turn clean — this is the server
    // twin of the reducer's startCombat reset.
    if (count > 0) {
      await logCombatLifecycleEvent(characterId, sessionId, "combatStarted", undefined, tx);
      await resetTurnSpellCast(tx, sessionId, characterId);
    }
    return buildCombatStateOrThrow(tx, sessionId, characterId);
  });
}

/**
 * Ends combat: sets combatActive=false and resets round=0 (mirrors the local
 * reducer's endCombat → initialState). Idempotent for the same reason as
 * startCombat — a stale second "End Combat" click is a no-op, not a re-log.
 */
export async function endCombat(characterId: string, sessionId: string): Promise<CombatState> {
  await assertActiveParticipant(sessionId, characterId);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.session.updateMany({
      where: { id: sessionId, combatActive: true },
      data: { combatActive: false, round: 0 },
    });
    // Same gating as startCombat (#1439 review): only the real true→false
    // transition logs and clears; a stale second End Combat is a pure no-op.
    if (count > 0) {
      await logCombatLifecycleEvent(characterId, sessionId, "combatEnded", undefined, tx);
      await resetTurnSpellCast(tx, sessionId, characterId);
    }
    return buildCombatStateOrThrow(tx, sessionId, characterId);
  });
}

/**
 * Advances the round by exactly 1. THE ROUND NUMBER IS NEVER CLIENT INPUT
 * (#1030): callers send intent only ("my turn ended"), and the server decides
 * the number via an atomic `round = round + 1` UPDATE — Postgres serializes
 * concurrent UPDATEs to the same row, so two participants ending their turns
 * at the same instant both land (round advances by 2, not lost to a
 * read-then-write race). There is no initiative order yet, so every genuine
 * end-turn call is its own +1; this function has no way to distinguish "two
 * real turns ended" from "one call fired twice" and doesn't try to — that
 * would need whose-turn-is-it tracking, an explicit non-goal for this phase.
 * 409s if combat isn't active — advancing a round with no encounter running
 * is meaningless, and the client only ever calls this while `inCombat`.
 */
export async function advanceCombatRound(characterId: string, sessionId: string): Promise<CombatState> {
  await assertActiveParticipant(sessionId, characterId);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.session.updateMany({
      where: { id: sessionId, combatActive: true },
      data: { round: { increment: 1 } },
    });
    if (count === 0) throw new CombatError(`Session ${sessionId} is not in combat`);
    // The round advancing is this character's turn ending — reset their per-turn
    // spell interlock (#1439), the server twin of the reducer's endTurn reset.
    await resetTurnSpellCast(tx, sessionId, characterId);
    const state = await buildCombatStateOrThrow(tx, sessionId, characterId);
    await logCombatLifecycleEvent(characterId, sessionId, "combatRoundAdvanced", state.round, tx);
    return state;
  });
}

// buildCombatState + the invariant that the session exists here (the mutations
// have already updated it under the same tx) — a null return would be a
// programmer error, not a client one.
async function buildCombatStateOrThrow(
  tx: Prisma.TransactionClient,
  sessionId: string,
  characterId: string,
): Promise<CombatState> {
  const state = await buildCombatState(tx, sessionId, characterId);
  if (!state) throw new CombatError(`Session not found: ${sessionId}`, 404);
  return state;
}

/** Cheap read for the combat-state poll (#1030): round/combatActive plus the
 *  acting character's resolved per-turn spell interlock (#1439). No participant
 *  gate here — the route checks the caller is a session participant. */
export async function getCombatState(
  sessionId: string,
  characterId: string,
): Promise<CombatState | null> {
  return buildCombatState(prisma, sessionId, characterId);
}
