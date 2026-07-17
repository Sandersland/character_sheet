import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useCombatLifecycle } from "@/features/session/useCombatLifecycle";
import { leaveSession } from "@/api/client";
import type { Character, Session } from "@/types/character";

vi.mock("@/api/client", () => ({
  leaveSession: vi.fn(),
  endSession: vi.fn(),
  applyExperienceOperations: vi.fn(),
}));
vi.mock("@/features/session/turnStatePersistence", () => ({ clearTurnState: vi.fn() }));

const mockLeave = vi.mocked(leaveSession);

const character = { id: "c1" } as Character;
const session = { id: "s1", campaignId: "camp1" } as Session;

function makeLive() {
  return { refresh: vi.fn().mockResolvedValue(undefined), setEndedSession: vi.fn(), bumpLog: vi.fn() };
}

beforeEach(() => vi.clearAllMocks());

describe("useCombatLifecycle leave errors (#979)", () => {
  it("surfaces a leaveError when Leave Session fails, and dismissLeaveError clears it", async () => {
    mockLeave.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() =>
      useCombatLifecycle({ character, session, onUpdate: vi.fn(), live: makeLive() }),
    );

    await act(async () => {
      await result.current.handleLeave();
    });
    await waitFor(() => expect(result.current.leaveError).toBeTruthy());

    act(() => result.current.dismissLeaveError());
    expect(result.current.leaveError).toBeNull();
  });

  it("leaves no error on a successful leave", async () => {
    mockLeave.mockResolvedValueOnce(undefined as never);
    const live = makeLive();
    const { result } = renderHook(() =>
      useCombatLifecycle({ character, session, onUpdate: vi.fn(), live }),
    );

    await act(async () => {
      await result.current.handleLeave();
    });
    expect(result.current.leaveError).toBeNull();
    expect(live.refresh).toHaveBeenCalledTimes(1);
  });

  it("no-ops handleLeave with a null (not-yet-joined) session", async () => {
    const { result } = renderHook(() =>
      useCombatLifecycle({ character, session: null, onUpdate: vi.fn(), live: makeLive() }),
    );
    await act(async () => {
      await result.current.handleLeave();
    });
    expect(mockLeave).not.toHaveBeenCalled();
    expect(result.current.leaveError).toBeNull();
  });
});
