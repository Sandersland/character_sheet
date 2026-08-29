import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { campaignKeys, characterKeys, inboxKeys } from "@/api/queryKeys";
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

  it("calls combineEntities once, atomically, with every loser and the survivor", async () => {
    combineEntities.mockResolvedValue({});
    const { result } = renderHook(() => useCombineCluster());

    act(() => {
      result.current.mutate({ campaignId: "camp-1", loserIds: ["e1", "e2"], survivorId: "e3" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(combineEntities).toHaveBeenCalledTimes(1);
    expect(combineEntities).toHaveBeenCalledWith("camp-1", "e3", ["e1", "e2"]);
  });

  it("surfaces a rejection as a mutation error, not a partial result", async () => {
    combineEntities.mockRejectedValue(new Error("Both entities are linked to an item"));
    const { result } = renderHook(() => useCombineCluster());

    act(() => {
      result.current.mutate({ campaignId: "camp-1", loserIds: ["e1", "e2"], survivorId: "e3" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Both entities are linked to an item");
    expect(result.current.data).toBeUndefined();
  });

  it("invalidates inbox + entities + merges + every open character's detail cache on success", async () => {
    combineEntities.mockResolvedValue({});
    const { result } = renderHook(() => useCombineCluster());
    getQueryClient().setQueryData(inboxKeys.all, []);
    getQueryClient().setQueryData(campaignKeys.entities("camp-1"), []);
    getQueryClient().setQueryData(campaignKeys.merges("camp-1"), []);
    getQueryClient().setQueryData(characterKeys.detail("char-1"), { id: "char-1" });

    act(() => {
      result.current.mutate({ campaignId: "camp-1", loserIds: ["e1"], survivorId: "e2" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getQueryClient().getQueryState(inboxKeys.all)?.isInvalidated).toBe(true);
    expect(getQueryClient().getQueryState(campaignKeys.entities("camp-1"))?.isInvalidated).toBe(true);
    expect(getQueryClient().getQueryState(campaignKeys.merges("camp-1"))?.isInvalidated).toBe(true);
    expect(getQueryClient().getQueryState(characterKeys.detail("char-1"))?.isInvalidated).toBe(true);
  });

  it("does NOT invalidate any cache on failure — nothing landed, so nothing is stale", async () => {
    combineEntities.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useCombineCluster());
    getQueryClient().setQueryData(inboxKeys.all, []);

    act(() => {
      result.current.mutate({ campaignId: "camp-1", loserIds: ["e1"], survivorId: "e2" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getQueryClient().getQueryState(inboxKeys.all)?.isInvalidated).toBe(false);
  });
});
