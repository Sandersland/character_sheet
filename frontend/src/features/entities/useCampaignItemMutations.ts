import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  awardCampaignItem,
  createCampaignItem,
  deleteCampaignItem,
  revokeCampaignItem,
  updateCampaignItem,
  updateEntity,
} from "@/api/client";
import { campaignKeys } from "@/api/queryKeys";
import { primeCampaignEntities } from "@/hooks/useCampaignEntities";
import type { CampaignEntity, CampaignItem, CampaignItemInput } from "@/types/character";

function sortedByName(list: CampaignItem[]): CampaignItem[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The six campaign-item write paths (#1299), split out of CampaignItemsPanel so
 * that component's own body stays under fallow's size/complexity gate. Each
 * mutation's onSuccess writes an exact splice into campaignKeys.items(campaignId)
 * — never an invalidate/refetch — and mirrors reveal/rename onto the shared
 * Codex entities cache, same as the panel always has.
 */
export function useCampaignItemMutations(campaignId: string, entities: CampaignEntity[]) {
  const queryClient = useQueryClient();

  function itemsCache(): CampaignItem[] {
    return queryClient.getQueryData<CampaignItem[]>(campaignKeys.items(campaignId)) ?? [];
  }
  function writeItems(list: CampaignItem[]): void {
    queryClient.setQueryData(campaignKeys.items(campaignId), list);
  }
  // Mirror a saved reveal/rename onto the fronting entity in the shared Codex
  // cache (revealInCache/renameInCache before #1299 — merged, same one-liner
  // each call site used, just patching a different field).
  function patchEntityInCache(entityId: string, patch: Partial<CampaignEntity>) {
    const target = entities.find((e) => e.id === entityId);
    if (target) {
      primeCampaignEntities(
        campaignId,
        entities.map((e) => (e.id === entityId ? { ...e, ...patch } : e)),
      );
    }
  }

  const createMutation = useMutation({
    mutationFn: (input: CampaignItemInput) => createCampaignItem(campaignId, input),
    onSuccess: (created) => {
      writeItems(sortedByName([...itemsCache(), created]));
      if (created.entity) {
        primeCampaignEntities(campaignId, [
          ...entities,
          {
            id: created.entity.id,
            campaignId,
            type: "ITEM",
            name: created.entity.name,
            aliases: [],
            notes: null,
            visibility: created.entity.visibility,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
          },
        ]);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: Partial<CampaignItemInput> }) =>
      updateCampaignItem(campaignId, itemId, input),
    onSuccess: (updated) => {
      writeItems(
        sortedByName(
          itemsCache().map((i) => (i.id === updated.id ? { ...updated, holders: i.holders ?? [] } : i)),
        ),
      );
      if (updated.entity) patchEntityInCache(updated.entity.id, { name: updated.entity.name });
    },
  });

  const toggleRevealMutation = useMutation({
    mutationFn: ({ item, next }: { item: CampaignItem; next: "HIDDEN" | "REVEALED" }) =>
      updateEntity(campaignId, item.entity!.id, { visibility: next }),
    onSuccess: (updatedEntity, { item }) => {
      writeItems(
        itemsCache().map((i) =>
          i.id === item.id && i.entity ? { ...i, entity: { ...i.entity, visibility: updatedEntity.visibility } } : i,
        ),
      );
      if (item.entity) patchEntityInCache(item.entity.id, { visibility: updatedEntity.visibility });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (item: CampaignItem) => deleteCampaignItem(campaignId, item.id),
    onSuccess: (_void, item) => {
      writeItems(itemsCache().filter((i) => i.id !== item.id));
      if (item.entity) {
        primeCampaignEntities(campaignId, entities.filter((e) => e.id !== item.entity!.id));
      }
    },
  });

  const awardMutation = useMutation({
    mutationFn: ({ item, characterId }: { item: CampaignItem; characterId: string }) =>
      awardCampaignItem(campaignId, item.id, { characterId }),
    onSuccess: ({ holders }, { item }) => {
      // Award reveals the fronting entity — reflect it in the cache too.
      writeItems(
        itemsCache().map((i) =>
          i.id === item.id
            ? { ...i, holders, entity: i.entity ? { ...i.entity, visibility: "REVEALED" } : i.entity }
            : i,
        ),
      );
      if (item.entity) patchEntityInCache(item.entity.id, { visibility: "REVEALED" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({ item, characterId }: { item: CampaignItem; characterId: string }) =>
      revokeCampaignItem(campaignId, item.id, { characterId }),
    onSuccess: ({ holders }, { item }) => {
      writeItems(itemsCache().map((i) => (i.id === item.id ? { ...i, holders } : i)));
    },
  });

  return { createMutation, updateMutation, toggleRevealMutation, deleteMutation, awardMutation, revokeMutation };
}
