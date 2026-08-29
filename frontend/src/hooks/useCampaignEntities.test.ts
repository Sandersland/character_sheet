import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQueryClient } from "@/api/queryClient";
import { campaignKeys } from "@/api/queryKeys";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import type { CampaignEntity } from "@/types/character";

const fetchEntities = vi.fn();
vi.mock("@/api/client", () => ({
  fetchEntities: (...args: unknown[]) => fetchEntities(...args),
}));

function entity(over: Partial<CampaignEntity> & { id: string }): CampaignEntity {
  return {
    campaignId: "camp-1",
    type: "NPC",
    name: "Aldric",
    aliases: [],
    notes: null,
    visibility: "CAMPAIGN",
    createdAt: "",
    updatedAt: "",
    ...over,
  } as CampaignEntity;
}

describe("useCampaignEntities", () => {
  beforeEach(() => {
    fetchEntities.mockReset();
  });

  it("no campaignId -> [], fetchEntities never called", () => {
    const { result } = renderHook(() => useCampaignEntities(null));
    expect(result.current.entities).toEqual([]);
    expect(fetchEntities).not.toHaveBeenCalled();
  });

  it("success -> list + byId keyed by id", async () => {
    const list = [entity({ id: "e1" }), entity({ id: "e2" })];
    fetchEntities.mockResolvedValue(list);
    const { result } = renderHook(() => useCampaignEntities("camp-1"));
    await waitFor(() => expect(result.current.entities).toEqual(list));
    expect(result.current.byId.get("e1")).toEqual(list[0]);
    expect(result.current.byId.get("e2")).toEqual(list[1]);
  });

  // Priming after a create must reach an already-mounted consumer
  // (EntityCreateForm, CampaignItemsPanel).
  it("a primeCampaignEntities call is seen by an already-mounted consumer", async () => {
    fetchEntities.mockResolvedValue([]);
    const { result } = renderHook(() => useCampaignEntities("camp-1"));
    await waitFor(() => expect(fetchEntities).toHaveBeenCalledTimes(1));

    const created = [entity({ id: "e1" })];
    primeCampaignEntities("camp-1", created);

    await waitFor(() => expect(result.current.entities).toEqual(created));
  });

  // Pins the module-level NONE constant that protects useMentionEditor's
  // memoisation on `entities` identity.
  it("entities keeps the same identity across re-renders when nothing changed", () => {
    const { result, rerender } = renderHook(() => useCampaignEntities(null));
    const before = result.current.entities;
    rerender();
    expect(result.current.entities).toBe(before);
  });

  // Two consumers mounting together share one request — dedupe is TanStack
  // Query's job, not a manual inflight map.
  it("two consumers mounting together issue one fetchEntities call", async () => {
    fetchEntities.mockResolvedValue([]);
    const first = renderHook(() => useCampaignEntities("camp-1"));
    const second = renderHook(() => useCampaignEntities("camp-1"));
    await waitFor(() => expect(first.result.current.entities).toEqual([]));
    await waitFor(() => expect(second.result.current.entities).toEqual([]));

    expect(fetchEntities).toHaveBeenCalledTimes(1);
  });

  it("primeCampaignEntities and the hook resolve the same QueryClient instance", async () => {
    fetchEntities.mockResolvedValue([]);
    renderHook(() => useCampaignEntities("camp-1"));
    const created = [entity({ id: "e1" })];
    primeCampaignEntities("camp-1", created);

    expect(getQueryClient().getQueryData(campaignKeys.entities("camp-1"))).toEqual(created);
  });
});
