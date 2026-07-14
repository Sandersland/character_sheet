import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  deleteEntity,
  fetchCampaign,
  fetchCampaignItemByEntity,
  fetchEntities,
  fetchEntityBacklinks,
  fetchEntityConnections,
  updateEntity,
} from "@/api/client";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import type {
  Campaign,
  CampaignEntity,
  CampaignItem,
  CampaignRole,
  EntityBacklink,
  EntityConnection,
  EntityType,
} from "@/types/character";

// Loads an entity (with derived stats), its role/item/backlinks/connections, and
// owns the edit-form + mutation state for EntityDetailPage. `entity === undefined`
// means still loading. `?edit=1` (#841 deep link) lands directly in edit state.
export function useEntityDetail(campaignId?: string, entityId?: string) {
  const { entities, byId } = useCampaignEntities(campaignId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const wantsEdit = searchParams.get("edit") === "1";

  const [entity, setEntity] = useState<CampaignEntity | null | undefined>(undefined);
  const [listed, setListed] = useState<CampaignEntity[]>([]);
  const [role, setRole] = useState<CampaignRole | undefined>(undefined);
  const [characters, setCharacters] = useState<NonNullable<Campaign["characters"]>>([]);
  const [item, setItem] = useState<CampaignItem | null>(null);
  const [backlinks, setBacklinks] = useState<EntityBacklink[]>([]);
  const [connections, setConnections] = useState<EntityConnection[]>([]);
  const [editing, setEditing] = useState(wantsEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<EntityType>("NPC");
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!campaignId || !entityId) return;
    let active = true;
    // Pane navigation keeps the page mounted (#842): reset per-entity state.
    setEntity(undefined);
    setBacklinks([]);
    setConnections([]);
    setEditing(wantsEdit);
    fetchCampaign(campaignId)
      .then((c) => {
        if (!active) return;
        setRole(c.role);
        setCharacters(c.characters ?? []);
      })
      .catch(() => active && setRole(undefined));
    fetchEntities(campaignId, { includeStats: true })
      .then((list) => {
        const found = list.find((e) => e.id === entityId) ?? null;
        if (!active) return;
        setListed(list);
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
    fetchEntityConnections(campaignId, entityId, { limit: 10 })
      .then((list) => active && setConnections(list))
      .catch(() => active && setConnections([]));
    return () => {
      active = false;
    };
  }, [campaignId, entityId, wantsEdit]);

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
      setEntity((prev) => (prev ? { ...prev, ...updated } : updated));
      setListed((prev) => prev.map((e) => (e.id === entityId ? { ...e, ...updated } : e)));
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
      setEntity((prev) => (prev ? { ...prev, ...updated } : updated));
      setListed((prev) => prev.map((e) => (e.id === entityId ? { ...e, ...updated } : e)));
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
    listed,
    role,
    characters,
    item,
    backlinks,
    connections,
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
