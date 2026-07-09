import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  deleteEntity,
  fetchCampaign,
  fetchCampaignItemByEntity,
  fetchEntities,
  fetchEntityBacklinks,
  updateEntity,
} from "@/api/client";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import type {
  CampaignEntity,
  CampaignItem,
  CampaignRole,
  EntityBacklink,
  EntityType,
} from "@/types/character";

// Loads an entity, its role/item/backlinks, and owns the edit-form + mutation
// state for EntityDetailPage. `entity === undefined` means still loading.
export function useEntityDetail(campaignId?: string, entityId?: string) {
  const { entities, byId } = useCampaignEntities(campaignId);
  const navigate = useNavigate();

  const [entity, setEntity] = useState<CampaignEntity | null | undefined>(undefined);
  const [role, setRole] = useState<CampaignRole | undefined>(undefined);
  const [item, setItem] = useState<CampaignItem | null>(null);
  const [backlinks, setBacklinks] = useState<EntityBacklink[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<EntityType>("NPC");
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!campaignId || !entityId) return;
    let active = true;
    fetchCampaign(campaignId)
      .then((c) => active && setRole(c.role))
      .catch(() => active && setRole(undefined));
    fetchEntities(campaignId)
      .then((list) => {
        const found = list.find((e) => e.id === entityId) ?? null;
        if (!active) return;
        setEntity(found);
        if (found) {
          setType(found.type);
          setName(found.name);
          setAliases(found.aliases.join(", "));
          setNotes(found.notes ?? "");
        }
      })
      .catch(() => active && setEntity(null));
    fetchEntityBacklinks(campaignId, entityId)
      .then((list) => active && setBacklinks(list))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [campaignId, entityId]);

  // ITEM entities front a DM-authored CampaignItem — load its card data. The
  // by-entity read 404s for a non-owner while the entity is hidden (setItem null).
  useEffect(() => {
    if (!campaignId || !entityId || entity?.type !== "ITEM") return;
    let active = true;
    fetchCampaignItemByEntity(campaignId, entityId)
      .then((i) => active && setItem(i))
      .catch(() => active && setItem(null));
    return () => {
      active = false;
    };
  }, [campaignId, entityId, entity?.type]);

  function startEdit() {
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function handleSave() {
    if (!campaignId || !entityId || name.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateEntity(campaignId, entityId, {
        type,
        name: name.trim(),
        aliases: aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        notes: notes.trim() === "" ? null : notes.trim(),
      });
      setEntity(updated);
      // Keep the shared cache in sync so live @Name chips reflect the rename.
      primeCampaignEntities(campaignId, entities.map((e) => (e.id === entityId ? updated : e)));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entity.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!campaignId || !entityId) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEntity(campaignId, entityId);
      // Evict from the shared cache so live @Name chips drop the deleted entity.
      primeCampaignEntities(campaignId, entities.filter((e) => e.id !== entityId));
      navigate(`/campaigns/${campaignId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entity.");
      setBusy(false);
    }
  }

  async function handleToggleVisibility() {
    if (!campaignId || !entityId || !entity) return;
    setBusy(true);
    setError(null);
    try {
      const next = entity.visibility === "HIDDEN" ? "REVEALED" : "HIDDEN";
      const updated = await updateEntity(campaignId, entityId, { visibility: next });
      setEntity(updated);
      primeCampaignEntities(campaignId, entities.map((e) => (e.id === entityId ? updated : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change visibility.");
    } finally {
      setBusy(false);
    }
  }

  return {
    byId,
    entity,
    role,
    item,
    backlinks,
    editing,
    busy,
    error,
    form: { type, setType, name, setName, aliases, setAliases, notes, setNotes },
    startEdit,
    cancelEdit,
    handleSave,
    handleDelete,
    handleToggleVisibility,
  };
}
