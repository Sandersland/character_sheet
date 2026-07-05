import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { GiSpellBook } from "@/components/ui/icons";
import { createEntity, deleteEntity, updateEntity } from "@/api/client";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import {
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_OPTIONS,
  ENTITY_TYPE_TONE,
  matchEntities,
} from "@/lib/mentions";
import type { CampaignEntity, EntityType } from "@/types/character";

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
                      className="text-sm font-semibold text-parchment-900 hover:underline"
                    >
                      {e.name}
                    </Link>
                    <Badge tone={ENTITY_TYPE_TONE[e.type]}>{ENTITY_TYPE_LABELS[e.type]}</Badge>
                    {hidden && <Badge tone="neutral">🔒 Hidden</Badge>}
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
      </div>
    </Card>
  );
}
