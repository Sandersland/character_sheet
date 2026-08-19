import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { inboxKeys } from "@/api/queryKeys";
import { useDismissInboxFlag } from "@/features/inbox/useDismissInboxFlag";
import { useInbox } from "@/features/inbox/useInbox";
import type { InboxRow } from "@/types/character";

const dismissInboxFlag = vi.fn();
const fetchInbox = vi.fn();
vi.mock("@/api/client", () => ({
  dismissInboxFlag: (...args: unknown[]) => dismissInboxFlag(...args),
  fetchInbox: (...args: unknown[]) => fetchInbox(...args),
}));

const ROWS: InboxRow[] = [
  {
    kind: "NEEDS_CHRONICLING",
    campaignId: "camp-1",
    campaignName: "Strahd",
    signature: "camp-1",
    count: 2,
    signalAt: "2026-08-18T12:00:00.000Z",
  },
  {
    kind: "DUPLICATE_CLUSTER",
    campaignId: "camp-1",
    campaignName: "Strahd",
    signature: "sig-dupe",
    entities: [],
    defaultSurvivorId: "e1",
    signalAt: "2026-08-17T12:00:00.000Z",
  },
];

describe("useDismissInboxFlag", () => {
  beforeEach(() => {
    dismissInboxFlag.mockReset();
    fetchInbox.mockReset();
    getQueryClient().clear();
    getQueryClient().setQueryData(inboxKeys.all, ROWS);
  });

  it("optimistically removes the matching (kind, signature) row before the request resolves", async () => {
    dismissInboxFlag.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDismissInboxFlag());

    act(() => {
      result.current.mutate({ campaignId: "camp-1", kind: "NEEDS_CHRONICLING", signature: "camp-1" });
    });

    await waitFor(() =>
      expect(getQueryClient().getQueryData<InboxRow[]>(inboxKeys.all)).toEqual([ROWS[1]]),
    );
  });

  it("rolls the row back if the dismissal fails", async () => {
    dismissInboxFlag.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useDismissInboxFlag());

    act(() => {
      result.current.mutate({ campaignId: "camp-1", kind: "NEEDS_CHRONICLING", signature: "camp-1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getQueryClient().getQueryData<InboxRow[]>(inboxKeys.all)).toEqual(ROWS);
  });

  it("on success, invalidates WITHOUT an eager refetch — the optimistic removal is already exact", async () => {
    fetchInbox.mockResolvedValue(ROWS);
    dismissInboxFlag.mockResolvedValue(undefined);

    const { result: inbox } = renderHook(() => useInbox());
    await waitFor(() => expect(inbox.current.rows).toEqual(ROWS));
    fetchInbox.mockClear();

    const { result: dismiss } = renderHook(() => useDismissInboxFlag());
    act(() => {
      dismiss.current.mutate({ campaignId: "camp-1", kind: "NEEDS_CHRONICLING", signature: "camp-1" });
    });

    await waitFor(() => expect(dismiss.current.isSuccess).toBe(true));
    expect(getQueryClient().getQueryState(inboxKeys.all)?.isInvalidated).toBe(true);
    expect(fetchInbox).not.toHaveBeenCalled();
  });

  it("on failure, refetches eagerly to reconcile the rollback with the server", async () => {
    fetchInbox.mockResolvedValue(ROWS);
    dismissInboxFlag.mockRejectedValue(new Error("boom"));

    const { result: inbox } = renderHook(() => useInbox());
    await waitFor(() => expect(inbox.current.rows).toEqual(ROWS));
    fetchInbox.mockClear();

    const { result: dismiss } = renderHook(() => useDismissInboxFlag());
    act(() => {
      dismiss.current.mutate({ campaignId: "camp-1", kind: "NEEDS_CHRONICLING", signature: "camp-1" });
    });

    await waitFor(() => expect(dismiss.current.isError).toBe(true));
    await waitFor(() => expect(fetchInbox).toHaveBeenCalled());
  });
});
