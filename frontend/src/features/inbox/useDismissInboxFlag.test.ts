import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { inboxKeys } from "@/api/queryKeys";
import { useDismissInboxFlag } from "@/features/inbox/useDismissInboxFlag";
import type { InboxRow } from "@/types/character";

const dismissInboxFlag = vi.fn();
vi.mock("@/api/client", () => ({
  dismissInboxFlag: (...args: unknown[]) => dismissInboxFlag(...args),
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
});
