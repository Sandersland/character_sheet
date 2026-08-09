import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchCampaignItems } from "@/api/client";
import { campaignKeys } from "@/api/queryKeys";
import { useCampaignItemMutations } from "@/features/entities/useCampaignItemMutations";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import { useItemCatalog } from "@/hooks/useItemCatalog";
import { useItemRarities } from "@/hooks/useItemRarities";
import { buildInput, emptyForm, formFromItem, type FormState } from "@/lib/campaignItemForm";
import type { CampaignItem } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

/**
 * All of CampaignItemsPanel's non-render state + handlers (#1299), split out
 * so the component's own function stays under fallow's cognitive-complexity
 * gate — try/catch branching in five inline handlers was the cost driver, not
 * raw line count. The panel becomes a template over what this returns.
 */
export function useCampaignItemsPanelController(campaignId: string, edition: RulesEdition) {
  const { entities } = useCampaignEntities(campaignId);
  // The single query observer for the served rarity tiers (#1437) — the rows are
  // threaded to the row/form leaves as props so an N-item list stays at one.
  const rarities = useItemRarities(edition);
  const [creating, setCreating] = useState(false);
  // Non-null while editing an existing item; drives the shared form's mode.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-item chosen award target (character id).
  const [awardTarget, setAwardTarget] = useState<Record<string, string>>({});

  const itemsQuery = useQuery({
    queryKey: campaignKeys.items(campaignId),
    queryFn: () => fetchCampaignItems(campaignId),
  });
  const items = itemsQuery.data ?? [];

  // Static SRD catalog for the clone-from-catalog picker (#1332): shared with
  // every other /items reader via useItemCatalog/catalogKeys.items().
  const catalog = useItemCatalog();

  const { createMutation, updateMutation, toggleRevealMutation, deleteMutation, awardMutation, revokeMutation } =
    useCampaignItemMutations(campaignId, entities);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setCreating((c) => !c);
  }

  function startEdit(item: CampaignItem) {
    setEditingId(item.id);
    setForm(formFromItem(item));
    setCreating(false);
    setError(null);
  }

  function cancelForm() {
    setCreating(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit() {
    if (form.name.trim() === "") return;
    const editing = editingId !== null;
    setBusyId(editing ? editingId : "new");
    setError(null);
    try {
      if (editing) {
        await updateMutation.mutateAsync({ itemId: editingId, input: buildInput(form) });
      } else {
        await createMutation.mutateAsync(buildInput(form));
      }
      setForm(emptyForm);
      setCreating(false);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : editing ? "Failed to update item." : "Failed to create item.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleReveal(item: CampaignItem) {
    if (!item.entity) return;
    setBusyId(item.id);
    setError(null);
    try {
      const next = item.entity.visibility === "HIDDEN" ? "REVEALED" : "HIDDEN";
      await toggleRevealMutation.mutateAsync({ item, next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change visibility.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: CampaignItem) {
    setBusyId(item.id);
    setError(null);
    try {
      await deleteMutation.mutateAsync(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAward(item: CampaignItem) {
    // The Award button is disabled until a recipient is picked, so awardTarget
    // is always set here; the guard is a defensive backstop, not a fallback.
    const characterId = awardTarget[item.id];
    if (!characterId) return;
    setBusyId(item.id);
    setError(null);
    try {
      await awardMutation.mutateAsync({ item, characterId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to award item.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(item: CampaignItem, characterId: string) {
    setBusyId(item.id);
    setError(null);
    try {
      await revokeMutation.mutateAsync({ item, characterId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke item.");
    } finally {
      setBusyId(null);
    }
  }

  const displayError = error ?? (itemsQuery.isError ? "Failed to load campaign items." : null);

  return {
    items,
    catalog,
    rarities,
    creating,
    editingId,
    form,
    setForm,
    busyId,
    displayError,
    awardTarget,
    setAwardTarget,
    startCreate,
    startEdit,
    cancelForm,
    handleSubmit,
    toggleReveal,
    handleDelete,
    handleAward,
    handleRevoke,
  };
}
