import { render, screen, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchActiveSession, fetchSessionDoorway } from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { sessionKeys } from "@/api/queryKeys";
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
    // Dependent query: the full session only starts once the doorway confirms liveJoined, so it settles a render later.
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

    // Not mockResolvedValueOnce: staleTime 0 + refetchOnWindowFocus (#1299) means an
    // incidental refetch could consume a one-shot mock before refresh() does, silently
    // hiding the flip (#1349).
    mockDoorway.mockResolvedValue(doorway({ kind: "none", session: null }));
    await act(async () => {
      await refreshFn();
    });
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("none"));
  });

  // #1299: TanStack Query's own request coalescing guarantees a stale response can't
  // win — a query key with a fetch already in flight shares that SAME promise rather
  // than firing a second network call, so there's only ever one in-flight fetch per key.
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

    const refreshPromise = refreshFn();
    await act(async () => {
      resolveMount(doorway({ kind: "none", session: null }));
      await refreshPromise;
    });

    expect(mockDoorway).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("none"));
  });

  // #1299: the doorway opts back into refetch-on-focus (queryClient.ts's global default
  // is off) so a DM-ended session doesn't leave a zombie live tracker until the tab
  // regains focus.
  it("refetches the doorway when the window regains focus, without a manual refresh() call", async () => {
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "liveJoined", session: liveSession(true) }));
    mockActive.mockResolvedValue(fullSession);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("liveJoined"));
    expect(mockDoorway).toHaveBeenCalledTimes(1);

    mockDoorway.mockResolvedValueOnce(doorway({ kind: "none", session: null }));
    await act(async () => {
      window.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("none"));
    expect(mockDoorway).toHaveBeenCalledTimes(2);
  });

  // refresh() must not resolve until the full session is cached: invalidateQueries on
  // the active-session key is a no-op the instant join/start flips the doorway, because
  // that query's own observer is still enabled:false until React re-renders — #963's
  // callers route to the live tracker off this promise, not off a later render.
  it("does not resolve refresh() until the full session has loaded for a newly-joined session", async () => {
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "none", session: null }));

    let refreshFn: () => Promise<void> = async () => {};
    function Capture() {
      const { status, session, refresh } = useLiveSession();
      refreshFn = refresh;
      return (
        <div>
          <span data-testid="status">{status}</span>
          <span data-testid="parts">{session ? "full" : "none"}</span>
        </div>
      );
    }
    render(
      <LiveSessionProvider characterId="c1">
        <Capture />
      </LiveSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("none"));

    mockDoorway.mockResolvedValueOnce(doorway({ kind: "liveJoined", session: liveSession(true) }));
    mockActive.mockResolvedValue(fullSession);
    await act(async () => {
      await refreshFn();
    });

    // Deterministic, not a render-timing artifact: by the time refresh()'s own promise
    // resolves, the full session is already cached — safe for #963's callers to act
    // before React re-renders with the fresh doorway status.
    expect(mockActive).toHaveBeenCalledWith("c1");
    expect(getQueryClient().getQueryData(sessionKeys.active("c1"))).toEqual(fullSession);
    await waitFor(() => expect(screen.getByTestId("parts")).toHaveTextContent("full"));
  });

  // Leaving a session must drop the previous session's cached participants, or a later
  // join of a different session could transiently expose the old roster before its own
  // fetch lands.
  it("drops a previous session's cached participants once refresh() sees not-joined", async () => {
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "liveJoined", session: liveSession(true) }));
    mockActive.mockResolvedValue(fullSession);

    // One provider instance throughout: a second mount would itself trigger a background
    // refetch (staleTime:0) and consume the queued mock value below before refreshFn()
    // ever runs.
    let refreshFn: () => Promise<void> = async () => {};
    function Capture() {
      const { refresh } = useLiveSession();
      refreshFn = refresh;
      return null;
    }
    render(
      <LiveSessionProvider characterId="c1">
        <Capture />
      </LiveSessionProvider>,
    );
    await waitFor(() =>
      expect(getQueryClient().getQueryData(sessionKeys.active("c1"))).toEqual(fullSession),
    );

    mockDoorway.mockResolvedValueOnce(doorway({ kind: "none", session: null }));
    await act(async () => {
      await refreshFn();
    });

    expect(getQueryClient().getQueryData(sessionKeys.active("c1"))).toBeUndefined();
  });

  // The coalescing test above only covers the data===undefined branch (first-ever
  // fetch). This is the steady-state equivalent, where invalidateQueries'
  // cancelRefetch:true is what discards the stale response — per
  // @tanstack/query-core's Query.fetch, cancelRefetch only fires once
  // state.data !== undefined.
  it("cancels a slow refresh() so its payload never lands once a newer one has already resolved", async () => {
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "none", session: null }));

    // One provider instance throughout: a second mount would itself trigger a
    // background refetch (staleTime:0) and consume a queued mock value meant for the
    // "slow" refresh below.
    let refreshFn: () => Promise<void> = async () => {};
    function Capture() {
      const { status, refresh } = useLiveSession();
      refreshFn = refresh;
      return <span data-testid="capture-status">{status}</span>;
    }
    render(
      <LiveSessionProvider characterId="c1">
        <Capture />
      </LiveSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("capture-status")).toHaveTextContent("none"));

    let resolveSlow!: (v: SessionDoorwayState) => void;
    const slow = new Promise<SessionDoorwayState>((r) => {
      resolveSlow = r;
    });
    mockDoorway.mockReturnValueOnce(slow);
    const slowRefresh = refreshFn();

    mockDoorway.mockResolvedValueOnce(doorway({ kind: "liveNotJoined", session: liveSession(false) }));
    await act(async () => {
      await refreshFn();
    });
    await waitFor(() => expect(screen.getByTestId("capture-status")).toHaveTextContent("liveNotJoined"));

    await act(async () => {
      resolveSlow(doorway({ kind: "liveJoined", session: liveSession(true) }));
      await slowRefresh;
    });
    expect(screen.getByTestId("capture-status")).toHaveTextContent("liveNotJoined");
  });
});
