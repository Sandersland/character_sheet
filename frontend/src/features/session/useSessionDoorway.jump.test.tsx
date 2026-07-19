import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { fetchSessionDoorway, startCampaignSession } from "@/api/client";
import { LiveSessionProvider } from "@/features/session/LiveSessionProvider";
import { useSessionDoorway } from "@/features/session/useSessionDoorway";
import type { SessionDoorwayState } from "@/types/character";

const navigateMock = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));

vi.mock("@/api/client", () => ({
  fetchSessionDoorway: vi.fn(),
  fetchActiveSession: vi.fn().mockResolvedValue(null),
  startCampaignSession: vi.fn().mockResolvedValue(undefined),
  joinSession: vi.fn().mockResolvedValue(undefined),
}));

const mockDoorway = vi.mocked(fetchSessionDoorway);
const mockStart = vi.mocked(startCampaignSession);

function startableDoorway(): SessionDoorwayState {
  return { campaignId: "camp1", role: "PLAYER", canStart: true, kind: "none", session: null };
}

describe("useSessionDoorway.onAction jumps to Combat in-workspace (#963)", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    mockStart.mockClear();
    mockDoorway.mockResolvedValue(startableDoorway());
  });

  it("starts the session, then switches to the Combat tab — never navigates to /session", async () => {
    const onEnterCombat = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LiveSessionProvider characterId="c1">{children}</LiveSessionProvider>
    );
    const { result } = renderHook(() => useSessionDoorway("c1", onEnterCombat), { wrapper });

    // Wait for the doorway to resolve so summary.action === "start".
    await waitFor(() => expect(result.current.summary.action).toBe("start"));

    await act(async () => {
      result.current.onAction();
    });

    await waitFor(() => expect(mockStart).toHaveBeenCalledWith("camp1", "c1"));
    expect(onEnterCombat).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
