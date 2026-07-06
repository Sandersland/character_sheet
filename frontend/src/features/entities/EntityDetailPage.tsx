import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Spinner from "@/components/ui/Spinner";
import { GiQuillInk, Lock } from "@/components/ui/icons";
import {
  deleteEntity,
  fetchCampaign,
  fetchCampaignItemByEntity,
  fetchEntities,
  fetchEntityBacklinks,
  updateEntity,
} from "@/api/client";
import CampaignItemCard from "@/features/entities/CampaignItemCard";
import MentionText from "@/features/journal/MentionText";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import { useCampaignMerges } from "@/hooks/useCampaignMerges";
import { formatJournalDate } from "@/lib/formatJournalDate";
import { collectMergedInIdentities, resolveSurvivorChain } from "@/lib/merges";
import {
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_OPTIONS,
  ENTITY_TYPE_TONE,
} from "@/lib/mentions";
import type {
  CampaignEntity,
  CampaignItem,
  CampaignRole,
  EntityBacklink,
  EntityType,
} from "@/types/character";

// Group backlinks by their source session (preserving the newest-first order
// the API returns); a null sessionId collects under "Outside a session".
function groupBySession(backlinks: EntityBacklink[]): { key: string; items: EntityBacklink[] }[] {
  const groups = new Map<string, EntityBacklink[]>();
  for (const link of backlinks) {
    const key = link.entry.sessionId ?? "none";
    const items = groups.get(key) ?? [];
    items.push(link);
    groups.set(key, items);
  }
  return [...groups.entries()].map(([key, items]) => ({ key, items }));
}

// Group backlinks by the identity that was tagged (#387), first-seen order. On a
// survivor page a merged-in identity's entries collect under that identity.
function groupByIdentity(
  backlinks: EntityBacklink[],
): { id: string; name: string; items: EntityBacklink[] }[] {
  const groups = new Map<string, { id: string; name: string; items: EntityBacklink[] }>();
  for (const link of backlinks) {
    const existing = groups.get(link.identity.id);
    if (existing) existing.items.push(link);
    else groups.set(link.identity.id, { ...link.identity, items: [link] });
  }
  return [...groups.values()];
}

export default function EntityDetailPage() {
  const { id: campaignId, entityId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { entities, byId } = useCampaignEntities(campaignId);
  const { merges } = useCampaignMerges(campaignId);

  // Identity-merge chains (#387): survivors this entity is revealed to be, and the
  // former identities that merged into it. Both EXECUTED-only.
  const survivorChain = useMemo(
    () => (entityId ? resolveSurvivorChain(merges, entityId, { executedOnly: true }) : []),
    [merges, entityId],
  );
  const formerIdentityIds = useMemo(
    () => (entityId ? collectMergedInIdentities(merges, entityId, { executedOnly: true }) : []),
    [merges, entityId],
  );
  const nameFor = (id: string) => byId.get(id)?.name ?? "Unknown identity";

  function renderSessionGroups(links: EntityBacklink[]) {
    return (
      <div className="flex flex-col gap-4">
        {groupBySession(links).map((group) => (
          <div key={group.key} className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-parchment-500">
              {group.key === "none" ? "Outside a session" : "Session"}
            </p>
            <ul className="flex flex-col divide-y divide-parchment-200">
              {group.items.map((link) => (
                <li key={link.entry.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link
                      to={`/characters/${link.entry.characterId}`}
                      className="text-sm font-semibold text-garnet-700 hover:underline"
                    >
                      {link.characterName}
                    </Link>
                    <span className="whitespace-nowrap text-xs text-parchment-500">
                      {formatJournalDate(link.entry.date)}
                    </span>
                  </div>
                  <MentionText
                    body={link.entry.body}
                    entities={byId}
                    campaignId={campaignId}
                    className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-sm text-parchment-700"
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  // Return to wherever the user came from: Manage when the origin was the Manage
  // tab (carried via location.state.from or ?from=manage), else the Codex (#489).
  const backTo = useMemo(() => {
    const fromState = (location.state as { from?: string } | null)?.from;
    // Only honor an in-app relative path (defense-in-depth: the value is only
    // ever set by CampaignManagePanel, but never route to a non-"/" target).
    if (typeof fromState === "string" && fromState.startsWith("/")) return fromState;
    if (campaignId && new URLSearchParams(location.search).get("from") === "manage") {
      return `/campaigns/${campaignId}/manage`;
    }
    return campaignId ? `/campaigns/${campaignId}/codex` : "/campaigns";
  }, [location.state, location.search, campaignId]);

  const [entity, setEntity] = useState<CampaignEntity | null | undefined>(undefined);
  const [role, setRole] = useState<CampaignRole | undefined>(undefined);
  const [item, setItem] = useState<CampaignItem | null>(null);
  const [backlinks, setBacklinks] = useState<EntityBacklink[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identityGroups = useMemo(() => groupByIdentity(backlinks), [backlinks]);

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

  if (entity === undefined) return <Spinner variant="page" />;

  if (entity === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-parchment-100 px-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-parchment-900">Entity not found</h1>
        <Link
          to={backTo}
          className="rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 hover:bg-garnet-800"
        >
          Back to campaign
        </Link>
      </div>
    );
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

  const inputCls =
    "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";
  const labelCls = "block text-xs font-semibold text-parchment-700";

  return (
    <div className="min-h-screen bg-parchment-100">
      <div className="border-b border-parchment-200 bg-parchment-50">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <Link
            to={backTo}
            className="text-xs font-semibold text-garnet-700 hover:underline"
          >
            ← Back to campaign
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl font-semibold text-parchment-900">
            {entity.name}
            <Badge tone={ENTITY_TYPE_TONE[entity.type]}>{ENTITY_TYPE_LABELS[entity.type]}</Badge>
            {role === "OWNER" && entity.visibility === "HIDDEN" && (
              <Badge tone="neutral">
                <Lock aria-hidden="true" className="h-3 w-3" />
                Hidden
              </Badge>
            )}
          </h1>
        </div>
      </div>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        {survivorChain.length > 0 && (
          <div className="rounded-card border border-garnet-200 bg-garnet-50 px-4 py-3 text-sm text-garnet-900">
            <p className="font-semibold">
              Revealed to be{" "}
              <Link
                to={`/campaigns/${campaignId}/entities/${survivorChain[0]}`}
                className="text-garnet-700 hover:underline"
              >
                @{nameFor(survivorChain[0])}
              </Link>
            </p>
            {survivorChain.length > 1 && (
              <p className="mt-1 text-xs text-garnet-700">
                {[entity.name, ...survivorChain.map(nameFor)].join(" → ")}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-control bg-garnet-50 px-3 py-2 text-sm font-semibold text-garnet-700">
            {error}
          </p>
        )}

        {entity.type === "ITEM" && item && (
          <CampaignItemCard item={item} isOwner={role === "OWNER"} />
        )}

        <Card
          title="Details"
          headingLevel={2}
          titleAccessory={
            !editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-semibold text-garnet-700 hover:underline"
              >
                Edit
              </button>
            ) : null
          }
          className="p-4"
        >
          {editing ? (
            <div className="flex flex-col gap-3 p-4">
              <div>
                <label className={labelCls} htmlFor="entity-name">
                  Name *
                </label>
                <input
                  id="entity-name"
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="entity-type">
                  Type
                </label>
                <select
                  id="entity-type"
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
                <label className={labelCls} htmlFor="entity-aliases">
                  Aliases (comma-separated)
                </label>
                <input
                  id="entity-aliases"
                  className={inputCls}
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="entity-notes">
                  Notes
                </label>
                <textarea
                  id="entity-notes"
                  rows={4}
                  className={`${inputCls} resize-y`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-control px-3 py-1.5 text-xs font-semibold text-parchment-600 hover:text-parchment-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || name.trim() === ""}
                  onClick={handleSave}
                  className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              {entity.aliases.length > 0 && (
                <div>
                  <p className={labelCls}>Also known as</p>
                  <p className="text-sm text-parchment-800">{entity.aliases.join(", ")}</p>
                </div>
              )}
              <div>
                <p className={labelCls}>Notes</p>
                <p className="whitespace-pre-wrap text-sm text-parchment-800">
                  {entity.notes?.trim() ? entity.notes : "No notes yet."}
                </p>
              </div>
              {role === "OWNER" && (
                <div className="flex items-center gap-4 border-t border-parchment-200 pt-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleToggleVisibility}
                    className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                  >
                    {entity.visibility === "HIDDEN" ? "Reveal to players" : "Hide from players"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDelete}
                    className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                  >
                    Delete entity
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>

        {formerIdentityIds.length > 0 && (
          <Card title="Former identities" headingLevel={2} className="p-4">
            <div className="flex flex-col gap-1 p-4">
              <p className="text-xs text-parchment-600">
                Identities revealed to be this being.
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {formerIdentityIds.map((fid) => (
                  <li key={fid}>
                    <Link
                      to={`/campaigns/${campaignId}/entities/${fid}`}
                      className="text-sm font-semibold text-garnet-700 hover:underline"
                    >
                      {nameFor(fid)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}

        <Card title="Mentions" headingLevel={2} className="p-4">
          <div className="p-4">
            {backlinks.length === 0 ? (
              <EmptyState
                icon={<GiQuillInk />}
                title="No mentions yet"
                description="Notes that tag this entity will appear here."
              />
            ) : identityGroups.length > 1 ? (
              <div className="flex flex-col gap-5">
                {identityGroups.map((group) => (
                  <div key={group.id} className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-parchment-700">
                      As{" "}
                      <Link
                        to={`/campaigns/${campaignId}/entities/${group.id}`}
                        className="text-garnet-700 hover:underline"
                      >
                        {group.name}
                      </Link>
                    </p>
                    {renderSessionGroups(group.items)}
                  </div>
                ))}
              </div>
            ) : (
              renderSessionGroups(backlinks)
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
