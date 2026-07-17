import { render, screen, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchActiveSession, fetchSessionDoorway } from "@/api/client";
import { LiveSessionProvider, useLiveSession } from "@/features/session/LiveSessionProvider";
import type { Session, SessionDoorwayState } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchSessionDoorway: vi.fn(),
  fetchActiveSession: vi.fn(),
}));

const mockDoorway = vi.mocked(fetchSessionDoorway);
const mockActive = vi.mocked(fetchActiveSession);

function doorway(over: Partial<SessionDoorwayState> = {}): SessionDoorwayState {
  return { campaignId: "camp1", role: "PLAYER", canStart: true, kind: "none", session: null, ...over };
}
function liveSession(joined: boolean, over = {}) {
  return { id: "s1", status: "active" as const, startedAt: "2026-07-16T00:00:00Z", scheduledAt: null, title: "Night", joined, round: null, ...over };
}
const fullSession: Session = { id: "s1", campaignId: "camp1", status: "active", startedAt: "2026-07-16T00:00:00Z", title: "Night", participants: [] };

function Probe() {
  const { status, sessionId, session } = useLiveSession();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="sid">{sessionId ?? "-"}</span>
      <span data-testid="parts">{session ? "full" : "none"}</span>
    </div>
  );
}

function renderProvider() {
  return render(
    <LiveSessionProvider characterId="c1">
      <Probe />
    </LiveSessionProvider>,
  );
}

describe("LiveSessionProvider status mapping", () => {
  beforeEach(() => {
    mockDoorway.mockReset();
    mockActive.mockReset();
  });

  it("maps no active session to 'none' and never fetches the full session", async () => {
    mockDoorway.mockResolvedValue(doorway({ kind: "none", session: null }));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("none"));
    expect(mockActive).not.toHaveBeenCalled();
    expect(screen.getByTestId("parts")).toHaveTextContent("none");
  });

  it("maps an active session this character hasn't joined to 'liveNotJoined' (no full fetch)", async () => {
    mockDoorway.mockResolvedValue(doorway({ kind: "liveNotJoined", session: liveSession(false) }));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("liveNotJoined"));
    expect(mockActive).not.toHaveBeenCalled();
    expect(screen.getByTestId("sid")).toHaveTextContent("s1");
  });

  it("maps a joined active session to 'liveJoined' and loads the full session (participants)", async () => {
    mockDoorway.mockResolvedValue(doorway({ kind: "liveJoined", session: liveSession(true) }));
    mockActive.mockResolvedValue(fullSession);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("liveJoined"));
    expect(mockActive).toHaveBeenCalledWith("c1");
    expect(screen.getByTestId("parts")).toHaveTextContent("full");
  });
});

describe("LiveSessionProvider refresh", () => {
  beforeEach(() => {
    mockDoorway.mockReset();
    mockActive.mockReset();
  });

  it("re-resolves on refresh(), flipping liveJoined → none", async () => {
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "liveJoined", session: liveSession(true) }));
    mockActive.mockResolvedValue(fullSession);

    let refreshFn: () => Promise<void> = async () => {};
    function Capture() {
      const { status, refresh } = useLiveSession();
      refreshFn = refresh;
      return <span data-testid="status">{status}</span>;
    }
    render(
      <LiveSessionProvider characterId="c1">
        <Capture />
      </LiveSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("liveJoined"));

    // The DM ended it: next doorway read has no active session.
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "none", session: null }));
    await act(async () => {
      await refreshFn();
    });
    expect(screen.getByTestId("status")).toHaveTextContent("none");
  });
});
