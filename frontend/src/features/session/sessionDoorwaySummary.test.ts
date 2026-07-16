import { describe, expect, it } from "vitest";

import { summarizeSessionDoorway } from "@/features/session/sessionDoorwaySummary";
import type { SessionDoorwayState, SessionDoorwaySessionState } from "@/types/character";

// A live/active session row for the doorway state (round/joined overridable).
function activeSession(over: Partial<SessionDoorwaySessionState> = {}): SessionDoorwaySessionState {
  return {
    id: "s1",
    status: "active",
    startedAt: "2026-07-16T18:00:00.000Z",
    scheduledAt: null,
    title: "The Sunless Citadel",
    joined: true,
    round: null,
    ...over,
  };
}

function state(over: Partial<SessionDoorwayState>): SessionDoorwayState {
  return {
    campaignId: "camp1",
    role: "PLAYER",
    canStart: true,
    kind: "none",
    session: null,
    ...over,
  };
}

describe("summarizeSessionDoorway", () => {
  it("is hidden for a solo character (no campaign)", () => {
    const s = summarizeSessionDoorway(state({ campaignId: null, canStart: false }));
    expect(s.visible).toBe(false);
  });

  describe("none", () => {
    it("shows the Start invite for a member who can start", () => {
      const s = summarizeSessionDoorway(state({ kind: "none", canStart: true }));
      expect(s).toMatchObject({ visible: true, tone: "invite", label: "Start session", action: "start" });
    });

    it("is hidden for a player who cannot start (nothing scheduled)", () => {
      const s = summarizeSessionDoorway(state({ kind: "none", canStart: false }));
      expect(s.visible).toBe(false);
    });
  });

  describe("liveJoined", () => {
    it("resumes with the round when combat has advanced", () => {
      const s = summarizeSessionDoorway(
        state({ kind: "liveJoined", session: activeSession({ round: 3 }) }),
      );
      expect(s).toMatchObject({ visible: true, tone: "live", label: "Resume session", sub: "Round 3", action: "resume" });
    });

    it("falls back to 'Live now' before any round", () => {
      const s = summarizeSessionDoorway(
        state({ kind: "liveJoined", session: activeSession({ round: null }) }),
      );
      expect(s.sub).toBe("Live now");
    });

    it("resumes the same way for an OWNER", () => {
      const s = summarizeSessionDoorway(
        state({ role: "OWNER", kind: "liveJoined", session: activeSession({ round: 1 }) }),
      );
      expect(s.action).toBe("resume");
    });
  });

  describe("liveNotJoined", () => {
    it("offers Join for a member not yet in the live session", () => {
      const s = summarizeSessionDoorway(
        state({ kind: "liveNotJoined", session: activeSession({ joined: false }) }),
      );
      expect(s).toMatchObject({ visible: true, tone: "live", label: "Join session", sub: "Live now", action: "join" });
    });
  });

  describe("earlyJoin", () => {
    it("offers Join into the lobby", () => {
      const s = summarizeSessionDoorway(state({ kind: "earlyJoin" }));
      expect(s).toMatchObject({ visible: true, tone: "live", label: "Join session", action: "join" });
    });
  });

  describe("scheduledUpcoming", () => {
    const now = new Date("2026-07-16T12:00:00");
    const scheduled = (over: Partial<SessionDoorwaySessionState> = {}) =>
      activeSession({
        status: "scheduled",
        startedAt: null,
        scheduledAt: "2026-07-18T19:00:00", // Sat 19:00, 2 calendar days out
        ...over,
      });

    it("is informational for a player (no button)", () => {
      const s = summarizeSessionDoorway(
        state({ role: "PLAYER", canStart: false, kind: "scheduledUpcoming", session: scheduled() }),
        now,
      );
      expect(s).toMatchObject({ visible: true, tone: "scheduled", label: "Next session", action: null });
      expect(s.sub).toBe("Sat 19:00 · in 2 days");
    });

    it("gives a DM the Start action", () => {
      const s = summarizeSessionDoorway(
        state({ role: "OWNER", canStart: true, kind: "scheduledUpcoming", session: scheduled() }),
        now,
      );
      expect(s.action).toBe("start");
      expect(s.tone).toBe("scheduled");
    });

    it("phrases tomorrow and today relatively", () => {
      const tomorrow = summarizeSessionDoorway(
        state({ canStart: false, kind: "scheduledUpcoming", session: scheduled({ scheduledAt: "2026-07-17T19:00:00" }) }),
        now,
      );
      expect(tomorrow.sub).toContain("tomorrow");
      const today = summarizeSessionDoorway(
        state({ canStart: false, kind: "scheduledUpcoming", session: scheduled({ scheduledAt: "2026-07-16T20:00:00" }) }),
        now,
      );
      expect(today.sub).toContain("today");
    });
  });
});
