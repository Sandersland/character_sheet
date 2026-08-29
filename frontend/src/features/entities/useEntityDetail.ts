import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  deleteEntity,
  deleteEntityPortrait,
  fetchCampaign,
  fetchCampaignItemByEntity,
  fetchEntities,
  fetchEntityBacklinks,
  fetchEntityConnections,
  updateEntity,
  uploadEntityPortrait,
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
import type { RulesEdition } from "@character-sheet/shared-types";

interface DetailSetters {
  role: (r: CampaignRole | undefined) => void;
  characters: (c: NonNullable<Campaign["characters"]>) => void;
  rulesEdition: (e: RulesEdition | undefined) => void;
  listed: (l: CampaignEntity[]) => void;
  entity: (e: CampaignEntity | null) => void;
  form: (found: CampaignEntity) => void;
  backlinks: (b: EntityBacklink[]) => void;
  connections: (c: EntityConnection[]) => void;
}

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

function loadEntityDetail(campaignId: string, entityId: string, set: DetailSetters): () => void {
  let active = true;
  fetchCampaign(campaignId)
    .then((c) => {
      if (!active) return;
      set.role(c.role);
      set.characters(c.characters ?? []);
      // Rides the campaign read this effect already makes so an ITEM card's edition lookup doesn't need a second request (#1437).
      set.rulesEdition(c.rulesEdition);
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

// One sub-hook because role, characters, and rulesEdition all land from the same fetchCampaign call.
function useCampaignMeta() {
  const [role, setRole] = useState<CampaignRole | undefined>(undefined);
  const [characters, setCharacters] = useState<NonNullable<Campaign["characters"]>>([]);
  const [rulesEdition, setRulesEdition] = useState<RulesEdition | undefined>(undefined);
  // Stable so the load effect can depend on it without re-running per render, same reason useEntityForm memoizes `fill`.
  const set = useMemo(
    () => ({ role: setRole, characters: setCharacters, rulesEdition: setRulesEdition }),
    [],
  );
  return { role, characters, rulesEdition, set };
}

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
  return {
    type,
    setType,
    name,
    setName,
    aliases,
    setAliases,
    notes,
    setNotes,
    fill,
  };
}

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

  // Portrait writes ride the same apply path as PATCH so pane, rail, and shared cache pick up the fresh ?v= URL together (#1617).
  function handleUploadPortrait(file: File) {
    const { campaignId, entityId } = ctx;
    if (!campaignId || !entityId) return;
    void runMutation(setBusy, setError, "Failed to upload the portrait.", async () => {
      ctx.apply(campaignId, entityId, await uploadEntityPortrait(campaignId, entityId, file));
    });
  }

  function handleRemovePortrait() {
    const { campaignId, entityId } = ctx;
    if (!campaignId || !entityId) return;
    void runMutation(setBusy, setError, "Failed to remove the portrait.", async () => {
      ctx.apply(campaignId, entityId, await deleteEntityPortrait(campaignId, entityId));
    });
  }

  return {
    busy,
    error,
    handleSave,
    handleDelete,
    handleToggleVisibility,
    handleUploadPortrait,
    handleRemovePortrait,
  };
}

// entity === undefined means still loading; null means not found.
export function useEntityDetail(campaignId?: string, entityId?: string) {
  const { entities, byId } = useCampaignEntities(campaignId);
  const [searchParams] = useSearchParams();
  const wantsEdit = searchParams.get("edit") === "1";
  // Ref mirror so the load effect reads the latest value without re-running on ?edit flips.
  const wantsEditRef = useRef(wantsEdit);
  wantsEditRef.current = wantsEdit;

  const [entity, setEntity] = useState<CampaignEntity | null | undefined>(undefined);
  const [listed, setListed] = useState<CampaignEntity[]>([]);
  const meta = useCampaignMeta();
  const [item, setItem] = useState<CampaignItem | null>(null);
  const [backlinks, setBacklinks] = useState<EntityBacklink[]>([]);
  const [connections, setConnections] = useState<EntityConnection[]>([]);
  const [editing, setEditing] = useState(wantsEdit);
  const form = useEntityForm();
  const { fill } = form;

  useEffect(() => {
    if (!campaignId || !entityId) return;
    // item must reset here too: its loading effect never re-fires for a non-ITEM entity, and a stale item would trigger a false item-link-transfer warning in combine.
    setEntity(undefined);
    setItem(null);
    setBacklinks([]);
    setConnections([]);
    setEditing(wantsEditRef.current);
    return loadEntityDetail(campaignId, entityId, {
      ...meta.set,
      listed: setListed,
      entity: setEntity,
      form: fill,
      backlinks: setBacklinks,
      connections: setConnections,
    });
  }, [campaignId, entityId, fill, meta.set]);

  // The by-entity read 404s for a non-owner while the entity is hidden, hence the catch setting item to null.
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
    role: meta.role,
    characters: meta.characters,
    rulesEdition: meta.rulesEdition,
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
    handleUploadPortrait: mutations.handleUploadPortrait,
    handleRemovePortrait: mutations.handleRemovePortrait,
  };
}
