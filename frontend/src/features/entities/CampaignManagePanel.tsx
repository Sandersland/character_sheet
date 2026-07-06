import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { GiSpellBook } from "@/components/ui/icons";
import {
  createEntity,
  deleteEntity,
  executeEntityMerge,
  prepareEntityMerge,
  unmergeEntityMerge,
  updateEntity,
} from "@/api/client";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import { primeCampaignMerges, useCampaignMerges } from "@/hooks/useCampaignMerges";
import {
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_OPTIONS,
  ENTITY_TYPE_TONE,
  matchEntities,
} from "@/lib/mentions";
import type { CampaignEntity, CampaignEntityMerge, EntityType } from "@/types/character";

interface CampaignManagePanelProps {
  campaignId: string;
}

const inputCls =
  "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";
const labelCls = "block text-xs font-semibold text-parchment-700";

// Owner-only Manage tab (#379): the DM's entity administration surface. Lists
// every entity — including HIDDEN ones the backend keeps from players — with a
// reveal/hide toggle, delete, and a create form. Edit lives on the detail page.
export default function CampaignManagePanel({ campaignId }: CampaignManagePanelProps) {
  const { entities } = useCampaignEntities(campaignId);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<EntityType>("NPC");
  const [name, setName] = useState("");
  const [startHidden, setStartHidden] = useState(true);

  const { merges } = useCampaignMerges(campaignId);
  const [mergingOpen, setMergingOpen] = useState(false);
  const [mergedId, setMergedId] = useState("");
  const [survivorId, setSurvivorId] = useState("");
  const [mergeNote, setMergeNote] = useState("");

  const nameById = useMemo(() => new Map(entities.map((e) => [e.id, e.name])), [entities]);
  const preparedIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of merges) {
      if (m.status !== "PREPARED") continue;
      s.add(m.mergedEntityId);
      s.add(m.survivorEntityId);
    }
    return s;
  }, [merges]);
  const sortedMerges = useMemo(
    () => [...merges].sort((a, b) => a.preparedAt.localeCompare(b.preparedAt)),
    [merges],
  );

  const visible = useMemo(
    () => matchEntities(entities, query).sort((a, b) => a.name.localeCompare(b.name)),
    [entities, query],
  );

  function replaceEntity(updated: CampaignEntity) {
    primeCampaignEntities(
      campaignId,
      entities.map((e) => (e.id === updated.id ? updated : e)),
    );
  }

  async function toggleVisibility(entity: CampaignEntity) {
    setBusyId(entity.id);
    setError(null);
    try {
      const next = entity.visibility === "HIDDEN" ? "REVEALED" : "HIDDEN";
      replaceEntity(await updateEntity(campaignId, entity.id, { visibility: next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change visibility.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(entity: CampaignEntity) {
    setBusyId(entity.id);
    setError(null);
    try {
      await deleteEntity(campaignId, entity.id);
      primeCampaignEntities(
        campaignId,
        entities.filter((e) => e.id !== entity.id),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entity.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate() {
    if (name.trim() === "") return;
    setBusyId("new");
    setError(null);
    try {
      const created = await createEntity(campaignId, {
        type,
        name: name.trim(),
        visibility: startHidden ? "HIDDEN" : "REVEALED",
      });
      primeCampaignEntities(campaignId, [...entities, created]);
      setName("");
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entity.");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePrepareMerge() {
    if (!mergedId || !survivorId || mergedId === survivorId) return;
    setBusyId("merge-new");
    setError(null);
    try {
      const created = await prepareEntityMerge(campaignId, {
        mergedEntityId: mergedId,
        survivorEntityId: survivorId,
        note: mergeNote.trim() || undefined,
      });
      primeCampaignMerges(campaignId, [...merges, created]);
      setMergedId("");
      setSurvivorId("");
      setMergeNote("");
      setMergingOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare merge.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleExecuteMerge(m: CampaignEntityMerge) {
    const mergedName = nameById.get(m.mergedEntityId) ?? "this identity";
    const survivorName = nameById.get(m.survivorEntityId) ?? "the survivor";
    if (
      !window.confirm(
        `Reveal ${mergedName} to be ${survivorName}? This publishes the link to all players and reveals ${survivorName} if it is hidden.`,
      )
    ) {
      return;
    }
    setBusyId(m.id);
    setError(null);
    try {
      const updated = await executeEntityMerge(campaignId, m.id);
      primeCampaignMerges(
        campaignId,
        merges.map((x) => (x.id === m.id ? updated : x)),
      );
      // The survivor may have been auto-revealed — reflect it in the entity list.
      const survivor = entities.find((e) => e.id === m.survivorEntityId);
      if (survivor && survivor.visibility === "HIDDEN") {
        replaceEntity({ ...survivor, visibility: "REVEALED" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute merge.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnmerge(m: CampaignEntityMerge) {
    const mergedName = nameById.get(m.mergedEntityId) ?? "this identity";
    const survivorName = nameById.get(m.survivorEntityId) ?? "the survivor";
    if (!window.confirm(`Unmerge ${mergedName} from ${survivorName}? They become independent again.`)) {
      return;
    }
    setBusyId(m.id);
    setError(null);
    try {
      await unmergeEntityMerge(campaignId, m.id);
      primeCampaignMerges(
        campaignId,
        merges.filter((x) => x.id !== m.id),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unmerge.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      title="Manage entities"
      headingLevel={2}
      titleAccessory={
        <button
          type="button"
          aria-expanded={creating}
          onClick={() => setCreating((c) => !c)}
          className="text-xs font-semibold text-garnet-700 hover:underline"
        >
          ➕ New entity
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

        {creating && (
          <div className="flex flex-col gap-3 rounded-control border border-parchment-200 bg-parchment-100 p-3">
            <div>
              <label className={labelCls} htmlFor="manage-entity-name">
                Name *
              </label>
              <input
                id="manage-entity-name"
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="manage-entity-type">
                Type
              </label>
              <select
                id="manage-entity-type"
                className={inputCls}
                value={type}
                onChange={(e) => setType(e.target.value as EntityType)}
              >
                {ENTITY_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-parchment-700">
              <input
                type="checkbox"
                checked={startHidden}
                onChange={(e) => setStartHidden(e.target.checked)}
              />
              Start hidden from players
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={busyId === "new" || name.trim() === ""}
                onClick={handleCreate}
                className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
              >
                {busyId === "new" ? "Creating…" : "Create entity"}
              </button>
            </div>
          </div>
        )}

        {entities.length === 0 ? (
          <EmptyState
            icon={<GiSpellBook />}
            title="No entities yet"
            description="Create NPCs, locations and secrets here, then reveal them to your players when the time is right."
          />
        ) : (
          <>
            <input
              type="search"
              aria-label="Search entities"
              placeholder="Search by name or alias…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={inputCls}
            />
            <ul className="flex flex-col divide-y divide-parchment-200">
              {visible.map((e) => {
                const hidden = e.visibility === "HIDDEN";
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link
                      to={`/campaigns/${campaignId}/entities/${e.id}`}
                      state={{ from: `/campaigns/${campaignId}/manage` }}
                      className="text-sm font-semibold text-parchment-900 hover:underline"
                    >
                      {e.name}
                    </Link>
                    <Badge tone={ENTITY_TYPE_TONE[e.type]}>{ENTITY_TYPE_LABELS[e.type]}</Badge>
                    {hidden && <Badge tone="neutral">🔒 Hidden</Badge>}
                    {preparedIds.has(e.id) && <Badge tone="neutral">🎭 Secretly linked</Badge>}
                    <span className="ml-auto flex items-center gap-3">
                      <button
                        type="button"
                        disabled={busyId === e.id}
                        onClick={() => toggleVisibility(e)}
                        className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        {hidden ? "Reveal" : "Hide"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === e.id}
                        onClick={() => handleDelete(e)}
                        className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="mt-2 border-t border-parchment-200 pt-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-parchment-900">Identity merges</h3>
            <button
              type="button"
              aria-expanded={mergingOpen}
              disabled={entities.length < 2}
              onClick={() => setMergingOpen((o) => !o)}
              className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
            >
              🎭 Prepare merge
            </button>
          </div>
          <p className="mt-1 text-xs text-parchment-600">
            Secretly link an old identity to its true self, then reveal it when the time is right.
          </p>

          {mergingOpen && (
            <div className="mt-2 flex flex-col gap-2 rounded-control border border-parchment-200 bg-parchment-100 p-3">
              <div>
                <label className={labelCls} htmlFor="merge-old">
                  Old identity *
                </label>
                <select
                  id="merge-old"
                  className={inputCls}
                  value={mergedId}
                  onChange={(e) => setMergedId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="merge-survivor">
                  Revealed to be *
                </label>
                <select
                  id="merge-survivor"
                  className={inputCls}
                  value={survivorId}
                  onChange={(e) => setSurvivorId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {entities
                    .filter((e) => e.id !== mergedId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="merge-note">
                  Note
                </label>
                <input
                  id="merge-note"
                  className={inputCls}
                  value={mergeNote}
                  onChange={(e) => setMergeNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busyId === "merge-new" || !mergedId || !survivorId || mergedId === survivorId}
                  onClick={handlePrepareMerge}
                  className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
                >
                  {busyId === "merge-new" ? "Preparing…" : "Prepare merge"}
                </button>
              </div>
            </div>
          )}

          {sortedMerges.length > 0 && (
            <ul className="mt-2 flex flex-col divide-y divide-parchment-200">
              {sortedMerges.map((m) => {
                const prepared = m.status === "PREPARED";
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="text-sm text-parchment-900">
                      {nameById.get(m.mergedEntityId) ?? "Unknown"}{" "}
                      <span className="text-parchment-500">→</span>{" "}
                      {nameById.get(m.survivorEntityId) ?? "Unknown"}
                    </span>
                    <Badge tone="neutral">{prepared ? "🎭 Secret" : "✓ Revealed"}</Badge>
                    <span className="ml-auto flex items-center gap-3">
                      {prepared && (
                        <button
                          type="button"
                          disabled={busyId === m.id}
                          onClick={() => handleExecuteMerge(m)}
                          className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                        >
                          Execute reveal
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => handleUnmerge(m)}
                        className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        {prepared ? "Cancel" : "Unmerge"}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
