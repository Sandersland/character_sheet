import type { Character, CharacterEvent, CombatState, Session, SessionDoorwayState } from "@/types/character";
import { jsonBody, request, send } from "@/api/http";

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

// Same response shapes as the campaign start/end, so the shared doorway +
// lifecycle plumbing only needs to branch on which call to make.
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

/** The session stays open for the rest of the party after this. */
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

/** Newest first. */
export async function fetchCampaignSessions(campaignId: string): Promise<Session[]> {
  return request<Session[]>(`/campaigns/${campaignId}/sessions`, undefined, "Failed to fetch sessions");
}

/** Newest first. */
export async function fetchSessions(characterId: string): Promise<Session[]> {
  return request<Session[]>(`/characters/${characterId}/sessions`, undefined, "Failed to fetch sessions");
}

/** Any session participant may edit the title after the fact; a non-participant 403s. */
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

export async function fetchActiveSession(characterId: string): Promise<Session | null> {
  // 200 with null body when no session is active.
  return request<Session | null>(
    `/characters/${characterId}/sessions/active`,
    undefined,
    "Failed to fetch active session",
  );
}

/** Solo characters get `campaignId: null` (bar absent). */
export async function fetchSessionDoorway(characterId: string): Promise<SessionDoorwayState> {
  return request<SessionDoorwayState>(
    `/characters/${characterId}/sessions/doorway`,
    undefined,
    "Failed to fetch session doorway",
  );
}

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
 * Intent only — no round number is sent; the server decides the next
 * round, so a stale local guess can never diverge from another
 * participant's view.
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

