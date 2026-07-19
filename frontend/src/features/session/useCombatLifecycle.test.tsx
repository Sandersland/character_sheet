import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useCombatLifecycle } from "@/features/session/useCombatLifecycle";
import { leaveAndClearTurnState } from "@/features/session/sessionLifecycleHelpers";
import { endSession, endSoloSession, leaveSession } from "@/api/client";
import type { Character, Session } from "@/types/character";

vi.mock("@/api/client", () => ({
  leaveSession: vi.fn(),
  endSession: vi.fn(),
  endSoloSession: vi.fn(),
  applyExperienceOperations: vi.fn(),
}));
vi.mock("@/features/session/turnStatePersistence", () => ({ clearTurnState: vi.fn() }));

const mockLeave = vi.mocked(leaveSession);
const mockEnd = vi.mocked(endSession);
const mockEndSolo = vi.mocked(endSoloSession);

const character = { id: "c1" } as Character;
const session = { id: "s1", campaignId: "camp1" } as Session;
const soloSession = { id: "s1", campaignId: null } as Session;

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

describe("useCombatLifecycle solo sessions (#1082)", () => {
  it("ends a solo session via endSoloSession, not the campaign endSession", async () => {
    mockEndSolo.mockResolvedValueOnce({ session: soloSession });
    const { result } = renderHook(() =>
      useCombatLifecycle({ character, session: soloSession, onUpdate: vi.fn(), live: makeLive() }),
    );

    await act(async () => {
      await result.current.handleConfirmEnd(0);
    });

    expect(mockEndSolo).toHaveBeenCalledWith("c1", "s1");
    expect(mockEnd).not.toHaveBeenCalled();
  });

  it("ends a campaign session via endSession (unchanged)", async () => {
    mockEnd.mockResolvedValueOnce({ session });
    const { result } = renderHook(() =>
      useCombatLifecycle({ character, session, onUpdate: vi.fn(), live: makeLive() }),
    );

    await act(async () => {
      await result.current.handleConfirmEnd(0);
    });

    expect(mockEnd).toHaveBeenCalledWith("camp1", "s1");
    expect(mockEndSolo).not.toHaveBeenCalled();
  });

  it("canLeave is true only for a joined campaign session — false for solo and no session", () => {
    const campaign = renderHook(() =>
      useCombatLifecycle({ character, session, onUpdate: vi.fn(), live: makeLive() }),
    );
    expect(campaign.result.current.canLeave).toBe(true);

    const solo = renderHook(() =>
      useCombatLifecycle({ character, session: soloSession, onUpdate: vi.fn(), live: makeLive() }),
    );
    expect(solo.result.current.canLeave).toBe(false);

    const none = renderHook(() =>
      useCombatLifecycle({ character, session: null, onUpdate: vi.fn(), live: makeLive() }),
    );
    expect(none.result.current.canLeave).toBe(false);
  });

  it("leaveAndClearTurnState fails loud on a solo session (Leave is campaign-only)", async () => {
    await expect(leaveAndClearTurnState(soloSession, "c1")).rejects.toThrow(/campaign/i);
    expect(mockLeave).not.toHaveBeenCalled();
  });
});
