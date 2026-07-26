import type { Character, CharacterEvent, CombatState, Session, SessionDoorwayState } from "@/types/character";
import { jsonBody, request, send } from "@/api/http";
import type { RollEventData } from "@character-sheet/shared-types";

/** Start a shared campaign session with the given character as first participant. */
export async function startCampaignSession(
  campaignId: string,
  characterId: string,
  title?: string,
): Promise<{ session: Session; character: Character }> {
  return request<{ session: Session; character: Character }>(
    `/campaigns/${campaignId}/sessions`,
    jsonBody({ characterId, title }),
    "Failed to start session",
  );
}

// Solo sessions (#1082) live on the character, not a campaign — a campaign-less
// character starts/ends its own private session through these character-scoped
// routes (#1081). Same response shapes as the campaign start/end so the shared
// doorway + lifecycle plumbing branches only on which call to make.

/** Start a solo (campaign-less) session for a character. */
export async function startSoloSession(
  characterId: string,
  title?: string,
): Promise<{ session: Session; character: Character }> {
  return request<{ session: Session; character: Character }>(
    `/characters/${characterId}/sessions`,
    jsonBody({ title }),
    "Failed to start session",
  );
}

/** End a solo session by id. */
export async function endSoloSession(
  characterId: string,
  sessionId: string,
): Promise<{ session: Session }> {
  return request<{ session: Session }>(
    `/characters/${characterId}/sessions/${sessionId}/end`,
    { method: "POST" },
    "Failed to end session",
  );
}

/** Add (or re-add) a character to an active campaign session. */
export async function joinSession(
  campaignId: string,
  sessionId: string,
  characterId: string,
): Promise<void> {
  await send(
    `/campaigns/${campaignId}/sessions/${sessionId}/join`,
    jsonBody({ characterId }),
    "Failed to join session",
  );
}

/** Record that a character left a session; it stays open for the rest of the party. */
export async function leaveSession(
  campaignId: string,
  sessionId: string,
  characterId: string,
): Promise<void> {
  await send(
    `/campaigns/${campaignId}/sessions/${sessionId}/leave`,
    jsonBody({ characterId }),
    "Failed to leave session",
  );
}

/** End a shared campaign session by id. */
export async function endSession(
  campaignId: string,
  sessionId: string,
): Promise<{ session: Session }> {
  return request<{ session: Session }>(
    `/campaigns/${campaignId}/sessions/${sessionId}/end`,
    { method: "POST" },
    "Failed to end session",
  );
}

/** List a campaign's sessions (newest first), with participants. */
export async function fetchCampaignSessions(campaignId: string): Promise<Session[]> {
  return request<Session[]>(`/campaigns/${campaignId}/sessions`, undefined, "Failed to fetch sessions");
}

/** List sessions a character participated in (newest first) — activity filter. */
export async function fetchSessions(characterId: string): Promise<Session[]> {
  return request<Session[]>(`/characters/${characterId}/sessions`, undefined, "Failed to fetch sessions");
}

/**
 * Set (or clear) a session's chapter title. Any session PARTICIPANT may edit it
 * after the fact (#863); a non-participant 403s. Returns the updated session.
 */
export async function updateSessionTitle(
  campaignId: string,
  sessionId: string,
  title: string | null,
): Promise<Session> {
  return request<Session>(
    `/campaigns/${campaignId}/sessions/${sessionId}`,
    jsonBody({ title }, "PATCH"),
    "Failed to update session title",
  );
}

/** Get the currently-active session, or null if none is active. */
export async function fetchActiveSession(characterId: string): Promise<Session | null> {
  // 200 with null body when no session is active.
  return request<Session | null>(
    `/characters/${characterId}/sessions/active`,
    undefined,
    "Failed to fetch active session",
  );
}

/**
 * Get the sheet's session-doorway state (#942) — the one state-aware fact set the
 * SessionDoorway bar renders. Solo characters get `campaignId: null` (bar absent).
 */
export async function fetchSessionDoorway(characterId: string): Promise<SessionDoorwayState> {
  return request<SessionDoorwayState>(
    `/characters/${characterId}/sessions/doorway`,
    undefined,
    "Failed to fetch session doorway",
  );
}

/** Get one session with its events. */
export async function fetchSession(
  characterId: string,
  sessionId: string,
): Promise<Session & { events: CharacterEvent[] }> {
  return request<Session & { events: CharacterEvent[] }>(
    `/characters/${characterId}/sessions/${sessionId}`,
    undefined,
    "Failed to fetch session",
  );
}

/** Start combat: returns the server's authoritative CombatState (#1030). */
export async function startCombat(
  characterId: string,
  sessionId: string,
): Promise<CombatState> {
  return request<CombatState>(
    `/characters/${characterId}/sessions/${sessionId}/combat/start`,
    { method: "POST" },
    "Failed to start combat",
  );
}

/** End combat: returns the server's authoritative CombatState (#1030). */
export async function endCombat(
  characterId: string,
  sessionId: string,
): Promise<CombatState> {
  return request<CombatState>(
    `/characters/${characterId}/sessions/${sessionId}/combat/end`,
    { method: "POST" },
    "Failed to end combat",
  );
}

/**
 * Advance the combat round by one. Intent only — no round number is ever
 * sent: the server decides the next round (#1030), so a stale local guess
 * can never diverge from what another participant sees. Returns the
 * resulting CombatState so the caller can sync immediately, without waiting
 * for the next poll tick.
 */
export async function advanceCombatRound(
  characterId: string,
  sessionId: string,
): Promise<CombatState> {
  return request<CombatState>(
    `/characters/${characterId}/sessions/${sessionId}/combat/round`,
    { method: "POST" },
    "Failed to advance combat round",
  );
}

/** Cheap poll read of a session's combat state (#1030) — round/combatActive/updatedAt only. */
export async function fetchCombatState(
  characterId: string,
  sessionId: string,
): Promise<CombatState> {
  return request<CombatState>(
    `/characters/${characterId}/sessions/${sessionId}/combat`,
    undefined,
    "Failed to fetch combat state",
  );
}

/**
 * Log a single roll from the session UI. Best-effort — callers catch and
 * console.error. `payload` is `RollEventData`, the single cross-tier shape for
 * this route's request body AND the persisted event `data` (#1235); see that
 * type for the field-by-field contract. `target`/`outcome` are omitted so
 * passing them is a compile error rather than a silent no-op — the route drops
 * them, and there is deliberately no producer (self-or-announce).
 */
export async function logRoll(
  characterId: string,
  sessionId: string,
  payload: Omit<RollEventData, "target" | "outcome">,
): Promise<void> {
  await send(
    `/characters/${characterId}/sessions/${sessionId}/roll`,
    jsonBody(payload),
    "Failed to log roll",
  );
}
