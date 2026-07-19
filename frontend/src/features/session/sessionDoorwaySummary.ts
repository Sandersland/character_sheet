// Pure summary model for the sheet's session doorway (#942) — the one
// always-visible, state-aware session affordance. Mirrors the journal doorway
// pattern (journalDoorwaySummary.ts): the SessionDoorway component is a dumb
// renderer of what this distills. The doorway state arrives from
// GET /api/characters/:id/sessions/doorway; this maps it to the four render
// facts plus a dispatchable action.
//
// All five contract kinds are handled here so the client is complete before
// scheduling (#951) starts emitting the scheduled kinds server-side. Today the
// server only returns none/liveJoined/liveNotJoined; the scheduled branches are
// exercised by unit tests against fixture states.

import type { SessionDoorwayState } from "@/types/character";

/** Visual register — color reinforces the label, never carries meaning alone. */
export type DoorwayTone = "live" | "scheduled" | "invite";

/** What the bar's tap dispatches; null = informational (no button). */
export type DoorwayAction = "resume" | "join" | "start" | null;

export interface SessionDoorwaySummary {
  /** When false the bar renders nothing and reclaims its height. */
  visible: boolean;
  tone: DoorwayTone;
  label: string;
  /** Secondary line (round, "Live now", schedule) — null when there's none. */
  sub: string | null;
  action: DoorwayAction;
}

const HIDDEN: SessionDoorwaySummary = {
  visible: false,
  tone: "invite",
  label: "",
  sub: null,
  action: null,
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Whole calendar days from `now` to `then` (both floored to local midnight). */
function calendarDaysUntil(then: Date, now: Date): number {
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

/** "Fri 7:00 · in 2 days" — weekday + time + a calm relative phrase. */
function formatSchedule(iso: string, now: Date): string {
  const when = new Date(iso);
  const time = `${when.getHours()}:${String(when.getMinutes()).padStart(2, "0")}`;
  const days = calendarDaysUntil(when, now);
  const relative =
    days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return `${WEEKDAYS[when.getDay()]} ${time} · ${relative}`;
}

/**
 * Distill the doorway state into what the bar renders. `now` is injectable so the
 * relative schedule phrasing is deterministic under test.
 */
export function summarizeSessionDoorway(
  state: SessionDoorwayState,
  now: Date = new Date(),
): SessionDoorwaySummary {
  // A null campaignId is a solo character (#1082), not a hidden bar: it still
  // gets Start (canStart) / Resume off the same kind switch — the only
  // campaign-specific paths (join/schedule) are unreachable for it server-side.
  const round = state.session?.round ?? null;

  switch (state.kind) {
    case "liveJoined":
      return {
        visible: true,
        tone: "live",
        label: "Resume session",
        sub: round !== null ? `Round ${round}` : "Live now",
        action: "resume",
      };

    case "liveNotJoined":
      return { visible: true, tone: "live", label: "Join session", sub: "Live now", action: "join" };

    case "earlyJoin":
      return { visible: true, tone: "live", label: "Join session", sub: "Lobby open", action: "join" };

    case "scheduledUpcoming": {
      const sub = state.session?.scheduledAt
        ? formatSchedule(state.session.scheduledAt, now)
        : null;
      // DM (canStart) can start early; a player just sees the informational strip.
      return {
        visible: true,
        tone: "scheduled",
        label: "Next session",
        sub,
        action: state.canStart ? "start" : null,
      };
    }

    case "none":
    default:
      // A member who can start gets the quiet invite; everyone else — nothing.
      return state.canStart
        ? { visible: true, tone: "invite", label: "Start session", sub: null, action: "start" }
        : HIDDEN;
  }
}
