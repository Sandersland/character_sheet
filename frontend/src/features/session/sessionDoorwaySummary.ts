// All five contract kinds are handled here already; the server only returns none/liveJoined/liveNotJoined today — scheduledUpcoming/earlyJoin are exercised by unit tests against fixture states until scheduling ships server-side.

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

function calendarDaysUntil(then: Date, now: Date): number {
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

function formatSchedule(iso: string, now: Date): string {
  const when = new Date(iso);
  const time = `${when.getHours()}:${String(when.getMinutes()).padStart(2, "0")}`;
  const days = calendarDaysUntil(when, now);
  const relative =
    days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return `${WEEKDAYS[when.getDay()]} ${time} · ${relative}`;
}

// `now` is injectable so the relative schedule phrasing is deterministic under test.
export function summarizeSessionDoorway(
  state: SessionDoorwayState,
  now: Date = new Date(),
): SessionDoorwaySummary {
  // A null campaignId is a solo character, not a hidden bar — it still gets Start/Resume off the same kind switch; only the campaign-specific paths (join/schedule) are unreachable for it.
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
      return state.canStart
        ? { visible: true, tone: "invite", label: "Start session", sub: null, action: "start" }
        : HIDDEN;
  }
}
