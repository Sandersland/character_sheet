import type { CampaignRole } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { getActiveSession } from "./sessions.js";

// The doorway is the sheet's one always-visible, state-aware session affordance
// (#942). This module is the read model behind GET
// /api/characters/:id/sessions/doorway — a small settle-on-read serializer, no
// schema change. The union below is the FROZEN contract: scheduling (#951)
// extends server behavior only (starts emitting the `scheduled*`/`earlyJoin`
// kinds + `scheduled` sessions, flips `canStart` owner-only). This issue never
// returns the scheduled kinds, but the shape already carries their fields so the
// client can be written against all five kinds today.

export type SessionDoorwayKind =
  | "none"
  | "liveJoined"
  | "liveNotJoined"
  | "scheduledUpcoming"
  | "earlyJoin";

export interface SessionDoorwaySessionState {
  id: string;
  status: "active" | "scheduled";
  startedAt: string | null;
  /** null until #951 (no scheduled sittings exist yet). */
  scheduledAt: string | null;
  title: string | null;
  /** This character is a present participant (joined, !leftAt). */
  joined: boolean;
  /** DERIVED from the latest combatRoundAdvanced event — never persisted. */
  round: number | null;
}

export interface SessionDoorwayState {
  /** null → character-scoped solo session; the client's signal for solo play (#1080). */
  campaignId: string | null;
  role: CampaignRole;
  /** THIS ISSUE: true for every campaign member and every solo character. #951 flips it owner-only. */
  canStart: boolean;
  kind: SessionDoorwayKind;
  session: SessionDoorwaySessionState | null;
}

/** Latest combat round for a session, or null when combat never advanced a round. */
async function latestCombatRound(sessionId: string): Promise<number | null> {
  const event = await prisma.characterEvent.findFirst({
    where: { sessionId, type: "combatRoundAdvanced" },
    orderBy: { createdAt: "desc" },
    select: { data: true },
  });
  const round = (event?.data as { round?: unknown } | null)?.round;
  return typeof round === "number" ? round : null;
}

/**
 * Builds the doorway state for a character. `getActiveSession` runs
 * autoCloseIfStale, so a stale session settles before we resolve (settle-on-read).
 * A campaign-less character gets a solo doorway (campaignId null, PLAYER, may
 * start): a solo session can legitimately surface `liveNotJoined` during the
 * leave grace window before auto-close. Only the live kinds
 * (`none`/`liveJoined`/`liveNotJoined`) are ever returned here; scheduling (#951)
 * adds the rest without changing this contract.
 */
export async function getSessionDoorway(
  characterId: string,
  userId: string,
): Promise<SessionDoorwayState> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { campaignId: true },
  });
  const campaignId = character?.campaignId ?? null;

  // Solo characters have no campaign membership; every solo character may start.
  const role: CampaignRole = campaignId
    ? (await prisma.campaignMembership.findUnique({
        where: { campaignId_userId: { campaignId, userId } },
        select: { role: true },
      }))?.role ?? "PLAYER"
    : "PLAYER";
  // #951 flips this owner-only; for now any member (and any solo character) may
  // start (mirrors today's startCampaignSession/startSoloSession authorization).
  const canStart = true;

  // character is always non-null here — the route layer's assertCharacterAccess
  // 404s first; standalone callers of a nonexistent id get canStart:true anyway.
  const active = character ? await getActiveSession(characterId) : null;
  if (!active) {
    return { campaignId, role, canStart, kind: "none", session: null };
  }

  const joined = active.participants.some((p) => p.characterId === characterId && p.leftAt === null);
  return {
    campaignId,
    role,
    canStart,
    kind: joined ? "liveJoined" : "liveNotJoined",
    session: {
      id: active.id,
      status: "active",
      startedAt: active.startedAt.toISOString(),
      scheduledAt: null,
      title: active.title,
      joined,
      round: await latestCombatRound(active.id),
    },
  };
}
