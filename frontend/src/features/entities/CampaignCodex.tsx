import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { GiSpellBook, Lock, Plus } from "@/components/ui/icons";
import { createEntity } from "@/api/client";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import {
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_OPTIONS,
  ENTITY_TYPE_TONE,
  matchEntities,
} from "@/lib/mentions";
import type { CampaignRole, EntityType } from "@/types/character";

interface CampaignCodexProps {
  campaignId: string;
  role?: CampaignRole;
}

const chipBase =
  "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600";
const chipOn = "bg-garnet-700 text-parchment-50";
const chipOff = "bg-parchment-100 text-parchment-600 hover:bg-parchment-200 hover:text-parchment-800";

const inputCls =
  "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";
const labelCls = "block text-xs font-semibold text-parchment-700";

// Codex tab: browse/search/filter/create for the campaign's entity registry.
// Rows link to EntityDetailPage, which owns edit/delete. Members see only
// revealed entities (server-filtered); the owner also sees HIDDEN ones with a
// Hidden badge, but reveal/hide administration lives on the Manage tab (#379).
export default function CampaignCodex({ campaignId, role }: CampaignCodexProps) {
  const { entities } = useCampaignEntities(campaignId);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntityType | "ALL">("ALL");

  const [creating, setCreating] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [type, setType] = useState<EntityType>("NPC");
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [notes, setNotes] = useState("");

  const visible = useMemo(
    () =>
      matchEntities(entities, query)
        .filter((e) => typeFilter === "ALL" || e.type === typeFilter)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [entities, query, typeFilter],
  );

  // Escape dismisses the open create panel (document-level, same pattern as DropdownMenu).
  useEffect(() => {
    if (!creating) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeForm();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [creating]);

  function closeForm() {
    setCreating(false);
    setFormError(null);
    setType("NPC");
    setName("");
    setAliases("");
    setNotes("");
    // The panel unmounts, so return keyboard focus to the toggle (same pattern as Popover).
    toggleRef.current?.focus();
  }

  async function handleCreate() {
    if (name.trim() === "") return;
    setBusy(true);
    setFormError(null);
    try {
      const created = await createEntity(campaignId, {
        type,
        name: name.trim(),
        aliases: aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        notes: notes.trim() === "" ? undefined : notes.trim(),
      });
      // Prime the shared cache so the list and journal @-chips update at once.
      primeCampaignEntities(campaignId, [...entities, created]);
      closeForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create entity.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Codex"
      headingLevel={2}
      titleAccessory={
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={creating}
          onClick={() => (creating ? closeForm() : setCreating(true))}
          className="inline-flex items-center gap-1 text-xs font-semibold text-garnet-700 hover:underline"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          New entity
        </button>
      }
      className="p-4"
    >
      <div className="flex flex-col gap-3 p-4">
        {creating && (
          <div className="flex flex-col gap-3 rounded-control border border-parchment-200 bg-parchment-100 p-3">
            {formError && (
              <p className="rounded-control bg-garnet-50 px-3 py-2 text-sm font-semibold text-garnet-700">
                {formError}
              </p>
            )}
            <div>
              <label className={labelCls} htmlFor="codex-entity-name">
                Name *
              </label>
              <input
                id="codex-entity-name"
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="codex-entity-type">
                Type
              </label>
              <select
                id="codex-entity-type"
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
            <div>
              <label className={labelCls} htmlFor="codex-entity-aliases">
                Aliases (comma-separated)
              </label>
              <input
                id="codex-entity-aliases"
                className={inputCls}
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="codex-entity-notes">
                Notes
              </label>
              <textarea
                id="codex-entity-notes"
                rows={3}
                className={`${inputCls} resize-y`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-control px-3 py-1.5 text-xs font-semibold text-parchment-600 hover:text-parchment-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || name.trim() === ""}
                onClick={handleCreate}
                className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create entity"}
              </button>
            </div>
          </div>
        )}
        {entities.length === 0 ? (
          <EmptyState
            icon={<GiSpellBook />}
            title="No entities yet"
            description="NPCs, locations, factions and more appear here once created or @-mentioned in a journal note."
          />
        ) : (
          <>
            <input
              type="search"
              aria-label="Search entities"
              placeholder="Search by name or alias…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none"
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
              <button
                type="button"
                aria-pressed={typeFilter === "ALL"}
                onClick={() => setTypeFilter("ALL")}
                className={`${chipBase} ${typeFilter === "ALL" ? chipOn : chipOff}`}
              >
                All
              </button>
              {ENTITY_TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={typeFilter === o.value}
                  onClick={() => setTypeFilter(o.value)}
                  className={`${chipBase} ${typeFilter === o.value ? chipOn : chipOff}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {visible.length === 0 ? (
              <p className="py-4 text-center text-sm text-parchment-600">
                No entities match your search.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-parchment-200">
                {visible.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/campaigns/${campaignId}/entities/${e.id}`}
                      className="flex flex-wrap items-center gap-2 rounded-control px-1 py-2 hover:bg-parchment-100"
                    >
                      <span className="text-sm font-semibold text-parchment-900">{e.name}</span>
                      <Badge tone={ENTITY_TYPE_TONE[e.type]}>{ENTITY_TYPE_LABELS[e.type]}</Badge>
                      {role === "OWNER" && e.visibility === "HIDDEN" && (
                        <Badge tone="neutral">
                          <Lock aria-hidden="true" className="h-3 w-3" />
                          Hidden
                        </Badge>
                      )}
                      {e.aliases.length > 0 && (
                        <span className="min-w-0 truncate text-xs text-parchment-500">
                          {e.aliases.join(", ")}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
