import { useEffect, useState } from "react";

import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { GiKnapsack, Plus } from "@/components/ui/icons";
import {
  awardCampaignItem,
  createCampaignItem,
  deleteCampaignItem,
  fetchCampaignItems,
  fetchItems,
  revokeCampaignItem,
  updateCampaignItem,
  updateEntity,
} from "@/api/client";
import CampaignItemForm from "@/features/entities/CampaignItemForm";
import CampaignItemRow from "@/features/entities/CampaignItemRow";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import { buildInput, emptyForm, formFromItem, type FormState } from "@/lib/campaignItemForm";
import type { CampaignItem, Item } from "@/types/character";

interface CampaignItemsPanelProps {
  campaignId: string;
  /** Member characters, so the DM can pick an award target. */
  characters: { id: string; name: string; ownerId: string }[];
}

// Owner-only Manage-tab panel (#380): authors DM campaign items via two paths —
// clone-from-SRD-catalog (pre-fills the form from a chosen Item) and from-scratch
// with category-conditional detail fields. The shared form is recomposed (#542)
// into labelled fieldsets with progressive disclosure. Each create auto-registers
// a HIDDEN ITEM entity; reveal/edit/delete here keep the shared Codex cache in sync.
export default function CampaignItemsPanel({ campaignId, characters }: CampaignItemsPanelProps) {
  const { entities } = useCampaignEntities(campaignId);
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [catalog, setCatalog] = useState<Item[]>([]);
  const [creating, setCreating] = useState(false);
  // Non-null while editing an existing item; drives the shared form's mode.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-item chosen award target (character id).
  const [awardTarget, setAwardTarget] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    fetchCampaignItems(campaignId)
      .then((list) => active && setItems(list))
      .catch(() => active && setError("Failed to load campaign items."));
    fetchItems()
      .then((list) => active && setCatalog(list))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [campaignId]);

  function revealInCache(entityId: string, visibility: "HIDDEN" | "REVEALED") {
    const target = entities.find((e) => e.id === entityId);
    if (target) {
      primeCampaignEntities(
        campaignId,
        entities.map((e) => (e.id === entityId ? { ...e, visibility } : e)),
      );
    }
  }

  // Mirror a saved rename onto the fronting entity in the shared Codex cache.
  function renameInCache(entityId: string, name: string) {
    const target = entities.find((e) => e.id === entityId);
    if (target) {
      primeCampaignEntities(
        campaignId,
        entities.map((e) => (e.id === entityId ? { ...e, name } : e)),
      );
    }
  }

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
        const updated = await updateCampaignItem(campaignId, editingId, buildInput(form));
        setItems((prev) =>
          prev
            .map((i) => (i.id === updated.id ? { ...updated, holders: i.holders ?? [] } : i))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        if (updated.entity) renameInCache(updated.entity.id, updated.entity.name);
      } else {
        const created = await createCampaignItem(campaignId, buildInput(form));
        setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        if (created.entity) primeCampaignEntities(campaignId, [...entities, { id: created.entity.id, campaignId, type: "ITEM", name: created.entity.name, aliases: [], notes: null, visibility: created.entity.visibility, createdAt: created.createdAt, updatedAt: created.updatedAt }]);
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
      const updated = await updateEntity(campaignId, item.entity.id, { visibility: next });
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id && i.entity ? { ...i, entity: { ...i.entity, visibility: updated.visibility } } : i,
        ),
      );
      revealInCache(item.entity.id, updated.visibility);
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
      await deleteCampaignItem(campaignId, item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      if (item.entity) {
        primeCampaignEntities(campaignId, entities.filter((e) => e.id !== item.entity!.id));
      }
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
      const { holders } = await awardCampaignItem(campaignId, item.id, { characterId });
      // Award reveals the fronting entity — reflect it locally + in the cache.
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, holders, entity: i.entity ? { ...i.entity, visibility: "REVEALED" } : i.entity }
            : i,
        ),
      );
      if (item.entity) revealInCache(item.entity.id, "REVEALED");
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
      const { holders } = await revokeCampaignItem(campaignId, item.id, { characterId });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, holders } : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke item.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      title="Campaign items"
      headingLevel={2}
      titleAccessory={
        <button
          type="button"
          aria-expanded={creating}
          onClick={startCreate}
          className="inline-flex items-center gap-1 text-xs font-semibold text-garnet-700 hover:underline"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          New item
        </button>
      }
      className="p-4"
    >
      <div className="flex flex-col gap-3 p-4">
        {error && (
          <p className="rounded-control bg-garnet-50 px-3 py-2 text-sm font-semibold text-garnet-700">
            {error}
          </p>
        )}

        {(creating || editingId !== null) && (
          <CampaignItemForm
            form={form}
            setForm={setForm}
            editingId={editingId}
            catalog={catalog}
            busyId={busyId}
            onSubmit={handleSubmit}
            onCancel={cancelForm}
          />
        )}

        {items.length === 0 ? (
          <EmptyState
            icon={<GiKnapsack />}
            title="No campaign items yet"
            description="Author magic items and loot here. Each starts hidden — reveal it to drop it into your players' Codex."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-parchment-200">
            {items.map((item) => (
              <CampaignItemRow
                key={item.id}
                item={item}
                campaignId={campaignId}
                characters={characters}
                busyId={busyId}
                awardTargetValue={awardTarget[item.id] ?? ""}
                onToggleReveal={toggleReveal}
                onEdit={startEdit}
                onDelete={handleDelete}
                onAward={handleAward}
                onRevoke={handleRevoke}
                onAwardTargetChange={(itemId, characterId) =>
                  setAwardTarget((prev) => ({ ...prev, [itemId]: characterId }))
                }
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
