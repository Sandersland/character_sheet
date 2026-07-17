import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchActiveSession, fetchSessionDoorway } from "@/api/client";
import { LiveSessionProvider } from "@/features/session/LiveSessionProvider";
import { TurnStateProvider, useTurnStateContext } from "@/features/session/TurnStateProvider";
import { useLiveRound } from "@/features/session/useLiveRound";
import type { Character, Session, SessionDoorwayState } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchSessionDoorway: vi.fn(),
  fetchActiveSession: vi.fn(),
}));

const mockDoorway = vi.mocked(fetchSessionDoorway);
const mockActive = vi.mocked(fetchActiveSession);

const character = { attacksPerAction: 1, inventory: [] } as unknown as Character;
const fullSession: Session = { id: "s1", campaignId: "camp1", status: "active", startedAt: "x", participants: [] };

function doorway(over: Partial<SessionDoorwayState>, sessionOver = {}): SessionDoorwayState {
  return {
    campaignId: "camp1",
    role: "PLAYER",
    canStart: true,
    kind: "none",
    session: null,
    ...over,
    ...(over.session ? { session: { ...over.session, ...sessionOver } } : {}),
  };
}

function Probe() {
  const turn = useTurnStateContext();
  const round = useLiveRound();
  return (
    <div>
      <span data-testid="turn">{turn ? "present" : "null"}</span>
      <span data-testid="round">{round ?? "-"}</span>
    </div>
  );
}

function renderStack() {
  return render(
    <LiveSessionProvider characterId="c1">
      <TurnStateProvider character={character}>
        <Probe />
      </TurnStateProvider>
    </LiveSessionProvider>,
  );
}

describe("TurnStateProvider single instance + useLiveRound", () => {
  beforeEach(() => {
    localStorage.clear();
    mockDoorway.mockReset();
    mockActive.mockReset();
  });

  it("has a null turn context and a null round when not joined (server round shows only in preview)", async () => {
    mockDoorway.mockResolvedValue(
      doorway({ kind: "liveNotJoined", session: { id: "s1", status: "active", startedAt: "x", scheduledAt: null, title: null, joined: false, round: 4 } }),
    );
    renderStack();
    // Not joined → turn context null; useLiveRound falls back to the doorway's server round.
    await waitFor(() => expect(screen.getByTestId("turn")).toHaveTextContent("null"));
    expect(screen.getByTestId("round")).toHaveTextContent("4");
  });

  it("exposes the LOCAL round from the mounted tracker when joined + in combat", async () => {
    // Seed a persisted in-combat turn state for this session.
    localStorage.setItem("cs:turn:s1", JSON.stringify({ inCombat: true, round: 3 }));
    mockDoorway.mockResolvedValue(
      doorway({ kind: "liveJoined", session: { id: "s1", status: "active", startedAt: "x", scheduledAt: null, title: null, joined: true, round: 99 } }),
    );
    mockActive.mockResolvedValue(fullSession);
    renderStack();
    await waitFor(() => expect(screen.getByTestId("turn")).toHaveTextContent("present"));
    // Local tracker wins over the (stale) doorway round of 99.
    expect(screen.getByTestId("round")).toHaveTextContent("3");
  });

  it("returns a null round when joined but not in combat", async () => {
    mockDoorway.mockResolvedValue(
      doorway({ kind: "liveJoined", session: { id: "s1", status: "active", startedAt: "x", scheduledAt: null, title: null, joined: true, round: null } }),
    );
    mockActive.mockResolvedValue(fullSession);
    renderStack();
    await waitFor(() => expect(screen.getByTestId("turn")).toHaveTextContent("present"));
    expect(screen.getByTestId("round")).toHaveTextContent("-");
  });
});
