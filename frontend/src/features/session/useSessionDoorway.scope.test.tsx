import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { fetchSessionDoorway, startCampaignSession } from "@/api/client";
import { LiveSessionProvider } from "@/features/session/LiveSessionProvider";
import { useSessionDoorway } from "@/features/session/useSessionDoorway";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import type { Character, Session, SessionDoorwayState } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchSessionDoorway: vi.fn(),
  fetchActiveSession: vi.fn().mockResolvedValue(null),
  startCampaignSession: vi.fn(),
  joinSession: vi.fn().mockResolvedValue(undefined),
}));

const mockDoorway = vi.mocked(fetchSessionDoorway);
const mockStart = vi.mocked(startCampaignSession);

function startableDoorway(): SessionDoorwayState {
  return { campaignId: "camp1", role: "PLAYER", canStart: true, kind: "none", session: null };
}

const startedSession: Session = {
  id: "s1",
  campaignId: "camp1",
  status: "active",
  startedAt: "2026-07-26T00:00:00Z",
  participants: [],
};

function makeCharacter(over: Partial<Character> = {}): Character {
  return { id: "c1", name: "Aldric", campaignId: null, journal: [], ...over } as unknown as Character;
}

// Doorway mutation shares character-<id> scope with useCharacterMutation so a slow HP response can't land after a faster Start/Join and vice versa.
describe("useSessionDoorway mutation scope (#1299 review)", () => {
  beforeEach(() => {
    mockStart.mockClear();
    mockDoorway.mockResolvedValue(startableDoorway());
  });

  it("queues the doorway mutation behind an in-flight character mutation for the same character", async () => {
    let resolveHp!: (c: Character) => void;
    const hpMutationFn = vi.fn(
      () =>
        new Promise<Character>((r) => {
          resolveHp = r;
        }),
    );
    const { result: hpResult } = renderHook(() =>
      useCharacterMutation<void, Character>({
        characterId: "c1",
        mutationFn: hpMutationFn,
        toCharacter: (c) => c,
        fallbackMessage: "failed",
      }),
    );

    mockStart.mockResolvedValue({ session: startedSession, character: makeCharacter({ name: "post-start" }) });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LiveSessionProvider characterId="c1">{children}</LiveSessionProvider>
    );
    const { result: doorwayResult } = renderHook(() => useSessionDoorway("c1"), { wrapper });
    await waitFor(() => expect(doorwayResult.current.summary.action).toBe("start"));

    act(() => {
      hpResult.current.mutate();
    });
    act(() => {
      doorwayResult.current.onAction();
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(mockStart).not.toHaveBeenCalled();

    resolveHp(makeCharacter({ name: "post-hp" }));
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
  });
});
