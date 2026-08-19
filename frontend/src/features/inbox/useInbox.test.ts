import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { inboxKeys } from "@/api/queryKeys";
import { useInbox } from "@/features/inbox/useInbox";
import type { InboxRow } from "@/types/character";

const fetchInbox = vi.fn();
vi.mock("@/api/client", () => ({
  fetchInbox: (...args: unknown[]) => fetchInbox(...args),
}));

describe("useInbox", () => {
  beforeEach(() => {
    fetchInbox.mockReset();
  });

  it("returns [] while loading", () => {
    fetchInbox.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useInbox());
    expect(result.current.rows).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it("returns the fetched rows on success", async () => {
    const rows: InboxRow[] = [
      {
        kind: "NEEDS_CHRONICLING",
        campaignId: "camp-1",
        campaignName: "Strahd",
        signature: "camp-1",
        count: 2,
        signalAt: "2026-08-18T12:00:00.000Z",
      },
    ];
    fetchInbox.mockResolvedValue(rows);
    const { result } = renderHook(() => useInbox());
    await waitFor(() => expect(result.current.rows).toEqual(rows));
  });

  it("pins a 60s staleTime and disables refetch-on-window-focus — GET /api/inbox is a full server-side clustering scan, not worth re-firing on every remount/focus", async () => {
    fetchInbox.mockResolvedValue([]);
    renderHook(() => useInbox());

    await waitFor(() => {
      const query = getQueryClient().getQueryCache().find({ queryKey: inboxKeys.all });
      const options = query?.options as { staleTime?: number; refetchOnWindowFocus?: boolean } | undefined;
      expect(options?.staleTime).toBe(60_000);
      expect(options?.refetchOnWindowFocus).toBe(false);
    });
  });
});
