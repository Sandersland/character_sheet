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
    // A separate wait: the full session is a dependent query that only starts
    // once the doorway confirms liveJoined, so it settles a render later.
    await waitFor(() => expect(screen.getByTestId("parts")).toHaveTextContent("full"));
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

  // #1299: the manual seq-ref race guard is gone — TanStack Query's own request
  // coalescing is what now guarantees a stale response can't win. A query key
  // with a fetch already in flight shares that SAME promise rather than firing
  // a second network call, so there is no "slow response overwrites a newer
  // one" race left to have: there is only ever one in-flight fetch per key.
  it("coalesces an overlapping refresh() into the mount fetch instead of double-fetching", async () => {
    let resolveMount!: (v: SessionDoorwayState) => void;
    const mountFetch = new Promise<SessionDoorwayState>((r) => {
      resolveMount = r;
    });
    mockDoorway.mockReturnValueOnce(mountFetch);

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
    expect(screen.getByTestId("status")).toHaveTextContent("loading");

    // Call refresh() while the mount fetch is still hanging.
    const refreshPromise = refreshFn();
    await act(async () => {
      resolveMount(doorway({ kind: "none", session: null }));
      await refreshPromise;
    });

    // Exactly one network call total — refresh() joined the mount fetch rather
    // than starting a second one.
    expect(mockDoorway).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("none"));
  });

  // #1299: the doorway is the one query that opts back into refetch-on-focus
  // (queryClient.ts's global default is off) — a DM-ended session must not
  // leave a zombie live tracker until the tab regains focus.
  it("refetches the doorway when the window regains focus, without a manual refresh() call", async () => {
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "liveJoined", session: liveSession(true) }));
    mockActive.mockResolvedValue(fullSession);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("liveJoined"));
    expect(mockDoorway).toHaveBeenCalledTimes(1);

    // The DM ended it while this tab was backgrounded.
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "none", session: null }));
    await act(async () => {
      window.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("none"));
    expect(mockDoorway).toHaveBeenCalledTimes(2);
  });
});
