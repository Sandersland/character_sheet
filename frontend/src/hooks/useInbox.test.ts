import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useInbox } from "@/hooks/useInbox";
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
});
