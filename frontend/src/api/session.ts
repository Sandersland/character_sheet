import type { Character, CharacterEvent, Session, SessionDoorwayState } from "@/types/character";
import { jsonBody, request, send } from "@/api/http";

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

/** Log a "combat started" event against the active session. */
export async function startCombat(
  characterId: string,
  sessionId: string,
): Promise<void> {
  await send(
    `/characters/${characterId}/sessions/${sessionId}/combat/start`,
    { method: "POST" },
    "Failed to start combat",
  );
}

/** Log a "combat ended" event against the active session. */
export async function endCombat(
  characterId: string,
  sessionId: string,
): Promise<void> {
  await send(
    `/characters/${characterId}/sessions/${sessionId}/combat/end`,
    { method: "POST" },
    "Failed to end combat",
  );
}

/** Log a "combat round advanced" event against the active session. */
export async function advanceCombatRound(
  characterId: string,
  sessionId: string,
  round: number,
): Promise<void> {
  await send(
    `/characters/${characterId}/sessions/${sessionId}/combat/round`,
    jsonBody({ round }),
    "Failed to advance combat round",
  );
}

/** Log a single roll from the session UI. Best-effort — callers catch and console.error. */
export async function logRoll(
  characterId: string,
  sessionId: string,
  payload: {
    kind: "attack" | "damage" | "check" | "save" | "initiative";
    source: string;
    total: number;
    specLabel?: string;
    damageType?: string;
    /** Raw kept die faces (non-dropped) so the Session Log can show the breakdown. */
    faces?: number[];
    /** Ability key for check/save rolls — source carries the display text. */
    ability?: string;
    /** Skill key for check rolls. */
    skill?: string;
    /** Target difficulty class, when the roll is made against one. */
    dc?: number;
    /** Advantage state the d20 was rolled with. */
    rollMode?: "normal" | "advantage" | "disadvantage";
  },
): Promise<void> {
  await send(
    `/characters/${characterId}/sessions/${sessionId}/roll`,
    jsonBody(payload),
    "Failed to log roll",
  );
}
