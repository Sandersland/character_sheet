import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
import { errorMessage } from "@/lib/errorMessage";
import type {
  Campaign,
  CampaignEntity,
  CampaignItem,
  CampaignRole,
  EntityBacklink,
  EntityConnection,
  EntityType,
} from "@/types/character";

interface DetailSetters {
  role: (r: CampaignRole | undefined) => void;
  characters: (c: NonNullable<Campaign["characters"]>) => void;
  listed: (l: CampaignEntity[]) => void;
  entity: (e: CampaignEntity | null) => void;
  form: (found: CampaignEntity) => void;
  backlinks: (b: EntityBacklink[]) => void;
  connections: (c: EntityConnection[]) => void;
}

// Load the DM item an ITEM entity fronts; returns the effect cleanup.
function loadCampaignItem(
  campaignId: string,
  entityId: string,
  setItem: (i: CampaignItem | null) => void,
): () => void {
  let active = true;
  fetchCampaignItemByEntity(campaignId, entityId)
    .then((i) => active && setItem(i))
    .catch(() => active && setItem(null));
  return () => {
    active = false;
  };
}

// Merge a PATCH result into the pane entity, the rail list, and the shared cache.
function mergeEntityUpdate(
  campaignId: string,
  entityId: string,
  updated: CampaignEntity,
  entities: CampaignEntity[],
  setEntity: Dispatch<SetStateAction<CampaignEntity | null | undefined>>,
  setListed: Dispatch<SetStateAction<CampaignEntity[]>>,
): void {
  setEntity((prev) => (prev ? { ...prev, ...updated } : updated));
  setListed((prev) => prev.map((e) => (e.id === entityId ? { ...e, ...updated } : e)));
  primeCampaignEntities(campaignId, entities.map((e) => (e.id === entityId ? updated : e)));
}

// Kick off all per-entity reads; returns the effect cleanup that cancels them.
function loadEntityDetail(campaignId: string, entityId: string, set: DetailSetters): () => void {
  let active = true;
  fetchCampaign(campaignId)
    .then((c) => {
      if (!active) return;
      set.role(c.role);
      set.characters(c.characters ?? []);
    })
    .catch(() => active && set.role(undefined));
  fetchEntities(campaignId, { includeStats: true })
    .then((list) => {
      if (!active) return;
      set.listed(list);
      const found = list.find((e) => e.id === entityId) ?? null;
      set.entity(found);
      if (found) set.form(found);
    })
    .catch(() => active && set.entity(null));
  fetchEntityBacklinks(campaignId, entityId)
    .then((list) => active && set.backlinks(list))
    .catch(() => {});
  fetchEntityConnections(campaignId, entityId, { limit: 10 })
    .then((list) => active && set.connections(list))
    .catch(() => active && set.connections([]));
  return () => {
    active = false;
  };
}

interface EntityFormValues {
  type: EntityType;
  name: string;
  aliases: string;
  notes: string;
}

function buildEntityPatch(form: EntityFormValues) {
  return {
    type: form.type,
    name: form.name.trim(),
    aliases: form.aliases
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    notes: form.notes.trim() === "" ? null : form.notes.trim(),
  };
}

async function runMutation(
  setBusy: (b: boolean) => void,
  setError: (e: string | null) => void,
  fallback: string,
  fn: () => Promise<void>,
): Promise<void> {
  setBusy(true);
  setError(null);
  try {
    await fn();
  } catch (err) {
    setError(errorMessage(err, fallback));
  } finally {
    setBusy(false);
  }
}

// The edit-form field state; `fill` seeds it from a freshly loaded entity.
function useEntityForm() {
  const [type, setType] = useState<EntityType>("NPC");
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [notes, setNotes] = useState("");
  // Stable so the load effect can depend on it without re-running per render.
  const fill = useCallback((found: CampaignEntity) => {
    setType(found.type);
    setName(found.name);
    setAliases(found.aliases.join(", "));
    setNotes(found.notes ?? "");
  }, []);
  return { type, setType, name, setName, aliases, setAliases, notes, setNotes, fill };
}

// Mutation surface (save/delete/reveal-hide + busy/error), split from the data
// loading. `apply` merges a PATCH result into pane/rail/shared-cache state.
function useEntityMutations(ctx: {
  campaignId?: string;
  entityId?: string;
  entity: CampaignEntity | null | undefined;
  entities: CampaignEntity[];
  form: EntityFormValues;
  apply: (campaignId: string, entityId: string, updated: CampaignEntity) => void;
  onSaved: () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const { campaignId, entityId, form } = ctx;
    if (!campaignId || !entityId || form.name.trim() === "") return;
    void runMutation(setBusy, setError, "Failed to save entity.", async () => {
      const updated = await updateEntity(campaignId, entityId, buildEntityPatch(form));
      ctx.apply(campaignId, entityId, updated);
      ctx.onSaved();
    });
  }

  function handleDelete() {
    const { campaignId, entityId } = ctx;
    if (!campaignId || !entityId) return;
    void runMutation(setBusy, setError, "Failed to delete entity.", async () => {
      await deleteEntity(campaignId, entityId);
      // Evict from the shared cache so live @Name chips drop the deleted entity.
      primeCampaignEntities(campaignId, ctx.entities.filter((e) => e.id !== entityId));
      navigate(`/campaigns/${campaignId}`);
    });
  }

  function handleToggleVisibility() {
    const { campaignId, entityId, entity } = ctx;
    if (!campaignId || !entityId || !entity) return;
    void runMutation(setBusy, setError, "Failed to change visibility.", async () => {
      const next = entity.visibility === "HIDDEN" ? "REVEALED" : "HIDDEN";
      ctx.apply(campaignId, entityId, await updateEntity(campaignId, entityId, { visibility: next }));
    });
  }

  return { busy, error, handleSave, handleDelete, handleToggleVisibility };
}

// Loads an entity (with derived stats), its role/item/backlinks/connections, and
// owns the edit-form + mutation state for EntityDetailPage. `entity === undefined`
// means still loading. `?edit=1` (#841 deep link) lands directly in edit state.
export function useEntityDetail(campaignId?: string, entityId?: string) {
  const { entities, byId } = useCampaignEntities(campaignId);
  const [searchParams] = useSearchParams();
  const wantsEdit = searchParams.get("edit") === "1";
  // Ref mirror so the load effect reads the latest value without re-running on ?edit flips.
  const wantsEditRef = useRef(wantsEdit);
  wantsEditRef.current = wantsEdit;

  const [entity, setEntity] = useState<CampaignEntity | null | undefined>(undefined);
  const [listed, setListed] = useState<CampaignEntity[]>([]);
  const [role, setRole] = useState<CampaignRole | undefined>(undefined);
  const [characters, setCharacters] = useState<NonNullable<Campaign["characters"]>>([]);
  const [item, setItem] = useState<CampaignItem | null>(null);
  const [backlinks, setBacklinks] = useState<EntityBacklink[]>([]);
  const [connections, setConnections] = useState<EntityConnection[]>([]);
  const [editing, setEditing] = useState(wantsEdit);
  const form = useEntityForm();
  const { fill } = form;

  useEffect(() => {
    if (!campaignId || !entityId) return;
    // Pane navigation keeps the page mounted (#842): reset per-entity state.
    setEntity(undefined);
    setBacklinks([]);
    setConnections([]);
    setEditing(wantsEditRef.current);
    return loadEntityDetail(campaignId, entityId, {
      role: setRole,
      characters: setCharacters,
      listed: setListed,
      entity: setEntity,
      form: fill,
      backlinks: setBacklinks,
      connections: setConnections,
    });
  }, [campaignId, entityId, fill]);

  // ITEM entities front a DM-authored CampaignItem — load its card data. The
  // by-entity read 404s for a non-owner while the entity is hidden (setItem null).
  useEffect(() => {
    if (!campaignId || !entityId || entity?.type !== "ITEM") return;
    return loadCampaignItem(campaignId, entityId, setItem);
  }, [campaignId, entityId, entity?.type]);

  function startEdit() {
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  // Keep the shared cache in sync so live @Name chips reflect a rename/reveal.
  const mutations = useEntityMutations({
    campaignId,
    entityId,
    entity,
    entities,
    form,
    apply: (cid, eid, updated) => mergeEntityUpdate(cid, eid, updated, entities, setEntity, setListed),
    onSaved: () => setEditing(false),
  });

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
    busy: mutations.busy,
    error: mutations.error,
    form,
    startEdit,
    cancelEdit,
    handleSave: mutations.handleSave,
    handleDelete: mutations.handleDelete,
    handleToggleVisibility: mutations.handleToggleVisibility,
  };
}
