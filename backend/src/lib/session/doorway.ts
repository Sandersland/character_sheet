import { prisma } from "@/lib/core/prisma.js";
import { getActiveSession } from "./sessions.js";
import type { SessionDoorwayRole, SessionDoorwayState } from "@character-sheet/shared-types";

// SessionDoorwayState is re-exported here so existing importers keep resolving it from this module (#1273).
export type { SessionDoorwayState };

// Superseded by Session.round/combatActive (#1030); kept only so backfillSessionCombatRound can seed those columns. Do not add a new call site.
// fallow-ignore-next-line unused-export -- sole consumer is backfillSessionCombatRound, under the ignored backend/scripts/**
export async function latestCombatRound(sessionId: string): Promise<number | null> {
  const event = await prisma.characterEvent.findFirst({
    where: { sessionId, type: "combatRoundAdvanced" },
    orderBy: { createdAt: "desc" },
    select: { data: true },
  });
  const round = (event?.data as { round?: unknown } | null)?.round;
  return typeof round === "number" ? round : null;
}

// Kept only for backfillSessionCombatRound, same reason as latestCombatRound — do not add a new call site.
// fallow-ignore-next-line unused-export -- sole consumer is backfillSessionCombatRound, under the ignored backend/scripts/**
export async function latestCombatActive(sessionId: string): Promise<boolean> {
  const event = await prisma.characterEvent.findFirst({
    where: { sessionId, type: { in: ["combatStarted", "combatEnded", "combatRoundAdvanced"] } },
    orderBy: { createdAt: "desc" },
    select: { type: true },
  });
  return event?.type === "combatStarted" || event?.type === "combatRoundAdvanced";
}

// getActiveSession runs autoCloseIfStale, so a stale session settles before this resolves.
// Only kind "none"/"liveJoined"/"liveNotJoined" are returned here; scheduling (#951) adds more kinds without changing this contract.
export async function getSessionDoorway(
  characterId: string,
  userId: string,
): Promise<SessionDoorwayState> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { campaignId: true },
  });
  const campaignId = character?.campaignId ?? null;

  const role: SessionDoorwayRole = campaignId
    ? (await prisma.campaignMembership.findUnique({
        where: { campaignId_userId: { campaignId, userId } },
        select: { role: true },
      }))?.role ?? "PLAYER"
    : "PLAYER";
  // #951 flips this owner-only; for now mirrors startCampaignSession/startSoloSession authorization.
  const canStart = true;

  // assertCharacterAccess 404s first, so character is always non-null here; standalone callers of a nonexistent id get canStart:true anyway.
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
      round: active.combatActive ? active.round : null,
    },
  };
}
