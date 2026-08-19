import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { campaignKeys, inboxKeys } from "@/api/queryKeys";
import { useCombineCluster } from "@/features/inbox/useCombineCluster";

const combineEntities = vi.fn();
vi.mock("@/api/client", () => ({
  combineEntities: (...args: unknown[]) => combineEntities(...args),
}));

describe("useCombineCluster", () => {
  beforeEach(() => {
    combineEntities.mockReset();
    getQueryClient().clear();
  });

  it("calls combineEntities once per loser, in order, into the survivor", async () => {
    combineEntities.mockResolvedValue({});
    const { result } = renderHook(() => useCombineCluster());

    act(() => {
      result.current.mutate({ campaignId: "camp-1", loserIds: ["e1", "e2"], survivorId: "e3" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(combineEntities.mock.calls).toEqual([
      ["camp-1", "e1", "e3"],
      ["camp-1", "e2", "e3"],
    ]);
    expect(result.current.data).toEqual([
      { entityId: "e1", ok: true },
      { entityId: "e2", ok: true },
    ]);
  });

  it("stops at the first failure and does not attempt the remaining losers", async () => {
    combineEntities
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Both entities are linked to an item"));
    const { result } = renderHook(() => useCombineCluster());

    act(() => {
      result.current.mutate({ campaignId: "camp-1", loserIds: ["e1", "e2", "e3"], survivorId: "e4" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(combineEntities).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual([
      { entityId: "e1", ok: true },
      { entityId: "e2", ok: false, error: "Both entities are linked to an item" },
    ]);
  });

  it("invalidates inbox + entities + merges caches whether the batch fully lands or partially fails", async () => {
    combineEntities.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useCombineCluster());
    getQueryClient().setQueryData(inboxKeys.all, []);
    getQueryClient().setQueryData(campaignKeys.entities("camp-1"), []);
    getQueryClient().setQueryData(campaignKeys.merges("camp-1"), []);

    act(() => {
      result.current.mutate({ campaignId: "camp-1", loserIds: ["e1"], survivorId: "e2" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getQueryClient().getQueryState(inboxKeys.all)?.isInvalidated).toBe(true);
    expect(getQueryClient().getQueryState(campaignKeys.entities("camp-1"))?.isInvalidated).toBe(true);
    expect(getQueryClient().getQueryState(campaignKeys.merges("camp-1"))?.isInvalidated).toBe(true);
  });
});
