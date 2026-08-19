import { describe, expect, it, vi } from "vitest";

import { invalidateCombineCaches } from "@/lib/combineCacheInvalidation";
import { campaignKeys, characterKeys, inboxKeys } from "@/api/queryKeys";

describe("invalidateCombineCaches", () => {
  it("invalidates inbox, entities, merges, and the whole character-detail family (review finding #3: chronicle carries no journal bodies)", () => {
    const invalidateQueries = vi.fn();
    const queryClient = { invalidateQueries } as unknown as import("@tanstack/react-query").QueryClient;

    invalidateCombineCaches(queryClient, "camp-1");

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: inboxKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: campaignKeys.entities("camp-1") });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: campaignKeys.merges("camp-1") });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: characterKeys.all });
    expect(invalidateQueries).toHaveBeenCalledTimes(4);
  });
});
