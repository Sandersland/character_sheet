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

  // Adversarial review, blocker: invalidateQueries on the active-session key was
  // a no-op the instant a join/start flips the doorway to joined — the active
  // query's OWN useQuery observer is still enabled:false at that point (React
  // hasn't re-rendered the fresh doorway yet), so refetchQueries' isDisabled()
  // filter silently skips it. refresh() must not resolve until the full session
  // is actually cached — #963's callers route to the live tracker off this
  // promise, not off a later render.
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

    // Mirrors useSessionDoorway's dispatch-then-refresh flow (#963): an
    // external join/start just landed, so the NEXT doorway read is joined.
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "liveJoined", session: liveSession(true) }));
    mockActive.mockResolvedValue(fullSession);
    await act(async () => {
      await refreshFn();
    });

    // Deterministic, not a render-timing artifact: by the time refresh()'s
    // OWN promise has resolved, the full session is already in the cache —
    // this is what makes it safe for #963's callers to act (e.g. switch to
    // Combat) the instant `await refresh()` returns, before React has even
    // re-rendered with the fresh doorway status.
    expect(mockActive).toHaveBeenCalledWith("c1");
    expect(getQueryClient().getQueryData(sessionKeys.active("c1"))).toEqual(fullSession);
    // The DOM catching up is a separate, ordinary React-render lag (query
    // notifications land a tick after the awaited promise settles) — real for
    // every query-cache write, not specific to this fix.
    await waitFor(() => expect(screen.getByTestId("parts")).toHaveTextContent("full"));
  });

  // Adversarial review, finding 7: leaving a session (refresh() while
  // not-joined) must drop the previous session's cached participants — else a
  // later join of a DIFFERENT session could transiently expose the old one's
  // roster before its own fetch lands.
  it("drops a previous session's cached participants once refresh() sees not-joined", async () => {
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "liveJoined", session: liveSession(true) }));
    mockActive.mockResolvedValue(fullSession);

    // One provider instance throughout — a second mount would itself trigger a
    // background refetch (staleTime:0) and consume the queued mock value below
    // before refreshFn() ever runs.
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

    // Left the session: the next doorway read is no longer joined.
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "none", session: null }));
    await act(async () => {
      await refreshFn();
    });

    expect(getQueryClient().getQueryData(sessionKeys.active("c1"))).toBeUndefined();
  });

  // Adversarial review, should-fix #3: the deleted seq-ref test asserted an
  // OUTCOME (a late response can't resurrect the tracker); the coalescing test
  // above only covers the data===undefined branch (first-ever fetch). This is
  // the steady-state equivalent, where `invalidateQueries`' cancelRefetch:true
  // is what actually discards the stale response (confirmed against
  // @tanstack/query-core's Query.fetch: cancelRefetch only fires when
  // `state.data !== undefined`, i.e. once something has already resolved).
  it("cancels a slow refresh() so its payload never lands once a newer one has already resolved", async () => {
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "none", session: null }));

    // One provider instance throughout — a second mount would itself trigger
    // a background refetch (staleTime:0) and consume a queued mock value
    // meant for the "slow" refresh below.
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

    // Slow refresh: starts a new fetch (data already exists from the mount
    // above) and hangs.
    let resolveSlow!: (v: SessionDoorwayState) => void;
    const slow = new Promise<SessionDoorwayState>((r) => {
      resolveSlow = r;
    });
    mockDoorway.mockReturnValueOnce(slow);
    const slowRefresh = refreshFn();

    // A second, newer refresh supersedes it and resolves immediately.
    mockDoorway.mockResolvedValueOnce(doorway({ kind: "liveNotJoined", session: liveSession(false) }));
    await act(async () => {
      await refreshFn();
    });
    await waitFor(() => expect(screen.getByTestId("capture-status")).toHaveTextContent("liveNotJoined"));

    // The slow call's payload finally arrives — it must never land.
    await act(async () => {
      resolveSlow(doorway({ kind: "liveJoined", session: liveSession(true) }));
      await slowRefresh;
    });
    expect(screen.getByTestId("capture-status")).toHaveTextContent("liveNotJoined");
  });
});
