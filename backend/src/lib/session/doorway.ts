import { prisma } from "@/lib/core/prisma.js";
import { getActiveSession } from "./sessions.js";
import type { SessionDoorwayRole, SessionDoorwayState } from "@character-sheet/shared-types";

// The doorway is the sheet's one always-visible, state-aware session affordance
// (#942). This module is the read model behind GET
// /api/characters/:id/sessions/doorway — a small settle-on-read serializer, no
// schema change. The shapes are the wire contract and live in shared-types
// (#1273), where the FROZEN-contract note on the kind union now lives too;
// SessionDoorwayState is re-exported so importers keep resolving it here.
export type { SessionDoorwayState };

/**
 * Latest combat round for a session per the OLD event-derived rule, or null
 * when combat never advanced a round. Superseded by `Session.round`/
 * `combatActive` (#1030) for every live read below — kept solely so
 * `backfillSessionCombatRound` can seed those columns on sessions that predate
 * the migration. Do not add a new call site: any live read of "what round is
 * it" belongs on the authoritative columns.
 */
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

/**
 * Whether a session was still mid-combat per the OLD event-derived rule: true
 * iff the LATEST of the three combat-lifecycle events is combatStarted or
 * combatRoundAdvanced (i.e. no later combatEnded), false otherwise — including
 * "never fought". Same event-reading shape as `latestCombatRound` (one
 * findFirst ordered by createdAt desc), widened to every combat event type
 * since "still active" depends on which KIND was logged last, not a round
 * number. Kept solely for `backfillSessionCombatRound`, for the same reason as
 * `latestCombatRound` — do not add a new call site.
 */
// fallow-ignore-next-line unused-export -- sole consumer is backfillSessionCombatRound, under the ignored backend/scripts/**
export async function latestCombatActive(sessionId: string): Promise<boolean> {
  const event = await prisma.characterEvent.findFirst({
    where: { sessionId, type: { in: ["combatStarted", "combatEnded", "combatRoundAdvanced"] } },
    orderBy: { createdAt: "desc" },
    select: { type: true },
  });
  return event?.type === "combatStarted" || event?.type === "combatRoundAdvanced";
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
  const role: SessionDoorwayRole = campaignId
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
      // Session.round/combatActive are authoritative (#1030); round only
      // means something while combat is active, else the doorway shows none.
      round: active.combatActive ? active.round : null,
    },
  };
}
