import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { fetchSessionDoorway, startCampaignSession, startSoloSession } from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import { LiveSessionProvider } from "@/features/session/LiveSessionProvider";
import { useSessionDoorway } from "@/features/session/useSessionDoorway";
import type { Character, Session, SessionDoorwayState } from "@/types/character";

const navigateMock = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));

const startedSession: Session = {
  id: "s1",
  campaignId: null,
  status: "active",
  startedAt: "2026-07-25T00:00:00Z",
  participants: [],
};
const startedCharacter = { id: "c1", name: "post-solo-start" } as unknown as Character;

vi.mock("@/api/client", () => ({
  fetchSessionDoorway: vi.fn(),
  fetchActiveSession: vi.fn().mockResolvedValue(null),
  startCampaignSession: vi.fn(),
  startSoloSession: vi.fn(),
  joinSession: vi.fn().mockResolvedValue(undefined),
}));

const mockDoorway = vi.mocked(fetchSessionDoorway);
const mockStartSolo = vi.mocked(startSoloSession);
const mockStartCampaign = vi.mocked(startCampaignSession);

// A campaign-less doorway: #1080 emits campaignId:null + canStart:true so the
// solo character can start its own session.
function soloDoorway(): SessionDoorwayState {
  return { campaignId: null, role: "PLAYER", canStart: true, kind: "none", session: null };
}

describe("useSessionDoorway solo start (#1082)", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    mockStartSolo.mockClear();
    mockStartCampaign.mockClear();
    mockStartSolo.mockResolvedValue({ session: startedSession, character: startedCharacter });
    mockDoorway.mockResolvedValue(soloDoorway());
  });

  it("starts a SOLO session via startSoloSession, then jumps to Combat — never the campaign start", async () => {
    const onEnterCombat = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LiveSessionProvider characterId="c1">{children}</LiveSessionProvider>
    );
    const { result } = renderHook(() => useSessionDoorway("c1", onEnterCombat), { wrapper });

    await waitFor(() => expect(result.current.summary.action).toBe("start"));

    await act(async () => {
      result.current.onAction();
    });

    await waitFor(() => expect(mockStartSolo).toHaveBeenCalledWith("c1"));
    expect(mockStartCampaign).not.toHaveBeenCalled();
    expect(onEnterCombat).toHaveBeenCalledTimes(1);
    // #1299: the returned character is an exact cache write, not a refetch.
    expect(getQueryClient().getQueryData(characterKeys.detail("c1"))).toBe(startedCharacter);
  });
});
