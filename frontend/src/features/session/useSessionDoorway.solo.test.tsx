import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { fetchSessionDoorway, startCampaignSession, startSoloSession } from "@/api/client";
import { LiveSessionProvider } from "@/features/session/LiveSessionProvider";
import { useSessionDoorway } from "@/features/session/useSessionDoorway";
import type { SessionDoorwayState } from "@/types/character";

const navigateMock = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));

vi.mock("@/api/client", () => ({
  fetchSessionDoorway: vi.fn(),
  fetchActiveSession: vi.fn().mockResolvedValue(null),
  startCampaignSession: vi.fn().mockResolvedValue(undefined),
  startSoloSession: vi.fn().mockResolvedValue(undefined),
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
  });
});
