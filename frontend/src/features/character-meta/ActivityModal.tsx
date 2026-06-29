import { useEffect, useState } from "react";

import { fetchActivity, fetchSessions, revertBatch } from "@/api/client";
import {
  categoryLabel,
  categoryTone,
  eventTypeLabel,
  CATEGORY_LABELS,
  INVENTORY_EVENT_TYPES,
} from "@/lib/events";
import { groupByBatch, groupByDate } from "@/lib/timeline";
import { summarizeSellBatch } from "@/lib/sellBatch";
import type { Character, CharacterEvent, CharacterEventCategory, CharacterEventField, Session } from "@/types/character";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";

interface ActivityModalProps {
  characterId: string;
  onClose: () => void;
  /** Called with the refreshed character when an undo revert completes. */
  onUpdate: (character: Character) => void;
  /** When set, scopes the timeline to one entity (e.g. a single InventoryItem). */
  entityId?: string;
}

// Category filter options: an "All" sentinel followed by every event category,
// in a stable order. Labels resolve through lib/events so keys never leak. These
// feed a compact <select> (not a tab strip) so all 11 categories fit the modal.
const CATEGORY_FILTER_IDS = Object.keys(CATEGORY_LABELS) as CharacterEventCategory[];

function FieldDiffs({ fields }: { fields: CharacterEventField[] }) {
  if (fields.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 pl-4 text-xs text-parchment-600">
      {fields.map((f) => (
        <li key={f.id}>
          <span className="font-mono">{f.path}</span>{" "}
          {f.oldValue !== undefined && (
            <span>
              <span className="text-garnet-600">{JSON.stringify(f.oldValue)}</span>
              {" → "}
            </span>
          )}
          <span className="text-vitality-700">{JSON.stringify(f.newValue)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ActivityModal({ characterId, onClose, onUpdate, entityId }: ActivityModalProps) {
  const [events, setEvents] = useState<CharacterEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  // Bulk-sale summary collapse (issue #104). Keyed by batch.key, kept INDEPENDENT
  // of expandedFields (keyed by event.id) so the summary line and the per-row
  // field-diff toggles can't collide.
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const showSpinner = useDelayedFlag(events === null && !error);

  // Filter state. "all" category disables the category predicate; an empty
  // typeFilter/sessionFilter disables those. Type chips are inventory-only.
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<string>("");
  const [sessions, setSessions] = useState<Session[]>([]);

  // Load events (with field-level diffs) on mount, when a filter changes, and
  // after an undo. Only defined filters are forwarded so an unfiltered load
  // sends exactly { includeFields: true }. An optional signal lets a superseded
  // filter-change load be aborted so a slow stale response can't overwrite a
  // fresher one.
  function load(signal?: AbortSignal) {
    setEvents(null);
    setError(null);
    fetchActivity(
      characterId,
      {
        includeFields: true,
        ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(sessionFilter ? { sessionId: sessionFilter } : {}),
        ...(entityId ? { entityId } : {}),
      },
      signal,
    )
      .then(setEvents)
      .catch((err) => {
        // A superseded load was aborted — ignore it; the newer load wins.
        if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setError("Couldn't load the activity log — try again.");
      });
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, categoryFilter, typeFilter, sessionFilter, entityId]);

  // Populate the session picker once per character.
  useEffect(() => {
    fetchSessions(characterId)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [characterId]);

  function selectCategory(id: string) {
    setCategoryFilter(id);
    // Type chips only make sense under Inventory; clear the type predicate when
    // leaving that category so a stale filter doesn't hide everything.
    if (id !== "inventory") setTypeFilter(null);
  }

  function toggleType(type: string) {
    setTypeFilter((prev) => (prev === type ? null : type));
  }

  function toggleFields(id: string) {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleBatch(key: string) {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleUndo(batchId: string) {
    setUndoing(true);
    setUndoError(null);
    try {
      const updated = await revertBatch(characterId, batchId);
      onUpdate(updated);
      load(); // Refresh the timeline so reverted events are dimmed.
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : "Undo failed — try again.");
    } finally {
      setUndoing(false);
    }
  }

  // Non-reverted, non-meta events in newest-first order.
  const activeEvents = (events ?? []).filter((e) => e.type !== "revert");
  const batches = groupByBatch(activeEvents);
  // Collapse batches that share a calendar date under one date header so the
  // label (TODAY, JUN 21, …) isn't repeated per batch.
  const dateGroups = groupByDate(batches);

  // The most-recent non-reverted batch is the only one eligible for undo — but
  // only against the FULL, unfiltered timeline. Under any active filter the
  // top-visible batch may not be the global most-recent one, so the server's
  // LIFO guard would reject the undo with 409; hide the affordance instead.
  const filtersActive =
    categoryFilter !== "all" || typeFilter !== null || sessionFilter !== "" || !!entityId;
  const undoableBatchId = filtersActive
    ? null
    : batches.find((b) => b.rows.every((r) => !r.reverted))?.key ?? null;

  return (
    <Modal title="Character Activity" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {/* ── Filter bar ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          {/* Category + Session as a matched pair of compact selects. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-xs text-parchment-600">
              <span className="font-semibold">Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => selectCategory(e.target.value)}
                className="rounded-control border border-parchment-200 bg-parchment-50 px-2 py-1 text-xs text-parchment-800"
              >
                <option value="all">All</option>
                {CATEGORY_FILTER_IDS.map((id) => (
                  <option key={id} value={id}>
                    {categoryLabel(id)}
                  </option>
                ))}
              </select>
            </label>

            {sessions.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-parchment-600">
                <span className="font-semibold">Session</span>
                <select
                  value={sessionFilter}
                  onChange={(e) => setSessionFilter(e.target.value)}
                  className="rounded-control border border-parchment-200 bg-parchment-50 px-2 py-1 text-xs text-parchment-800"
                >
                  <option value="">All sessions</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title ?? new Date(s.startedAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Inventory event-type chips — only meaningful under Inventory. */}
          {categoryFilter === "inventory" && (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Inventory event type filter">
              {INVENTORY_EVENT_TYPES.map((type) => {
                const pressed = typeFilter === type;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => toggleType(type)}
                    className={`rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600 ${
                      pressed ? "ring-2 ring-garnet-600" : "opacity-80 hover:opacity-100"
                    }`}
                  >
                    <Badge tone="gold">{eventTypeLabel(type)}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}

        {events === null && !error && showSpinner && <Spinner />}

        {events !== null && events.length === 0 && (
          <p className="py-6 text-center text-sm text-parchment-600">
            {filtersActive ? "No activity matches the current filters." : "No activity yet."}
          </p>
        )}

        {undoError && (
          <p className="text-xs font-semibold text-garnet-700">{undoError}</p>
        )}

        <ul className="flex flex-col gap-4">
          {dateGroups.map((group) => (
            <li key={group.label} className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
                {group.label}
              </p>
              <ul className="flex flex-col gap-3">
                {group.items.map((batch) => {
                  const isUndoable = batch.key === undoableBatchId;
                  const allReverted = batch.rows.every((r) => r.reverted);
                  // A bulk sale (>1 row, all `sold`) collapses to one summary
                  // line unless the user has expanded it.
                  const sell = summarizeSellBatch(batch.rows);
                  const collapsed = sell !== null && !expandedBatches.has(batch.key);
                  return (
                    <li key={batch.key}>
                      {isUndoable && (
                        <div className="mb-1 flex justify-end">
                          <button
                            type="button"
                            disabled={undoing}
                            onClick={() => handleUndo(batch.key)}
                            className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-50"
                          >
                            {undoing ? "Undoing…" : "Undo"}
                          </button>
                        </div>
                      )}
                      {collapsed ? (
                        <div
                          className={`flex items-start justify-between gap-3 text-sm transition-opacity ${
                            allReverted ? "opacity-40" : ""
                          }`}
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge tone={categoryTone("inventory")}>{eventTypeLabel("sold")}</Badge>
                            <span className="text-parchment-900">
                              Sold {sell!.itemCount} items for {sell!.totalLabel}
                            </span>
                            {allReverted && <Badge tone="neutral">reverted</Badge>}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleBatch(batch.key)}
                            className="shrink-0 text-xs text-parchment-600 hover:text-parchment-700"
                            aria-label="Show sold items"
                          >
                            ▼
                          </button>
                        </div>
                      ) : (
                      <ul className="flex flex-col gap-1.5">
                        {sell !== null && (
                          <li className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => toggleBatch(batch.key)}
                              className="text-xs text-parchment-600 hover:text-parchment-700"
                              aria-label="Collapse sold items"
                            >
                              ▲
                            </button>
                          </li>
                        )}
                        {batch.rows.map((event) => {
                          const hasFields = (event.fields?.length ?? 0) > 0;
                          const tone = categoryTone(event.category);
                          const label = eventTypeLabel(event.type);
                          return (
                            <li
                              key={event.id}
                              className={`flex flex-col text-sm transition-opacity ${
                                allReverted ? "opacity-40" : ""
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <span className="flex flex-wrap items-center gap-2">
                                  <Badge tone={tone}>{label}</Badge>
                                  <span className="text-parchment-900">
                                    {event.summary}
                                  </span>
                                  {event.reverted && (
                                    <Badge tone="neutral">reverted</Badge>
                                  )}
                                </span>
                                {hasFields && (
                                  <button
                                    type="button"
                                    onClick={() => toggleFields(event.id)}
                                    className="shrink-0 text-xs text-parchment-600 hover:text-parchment-700"
                                    aria-label={expandedFields.has(event.id) ? "Hide field changes" : "Show field changes"}
                                  >
                                    {expandedFields.has(event.id) ? "▲" : "▼"}
                                  </button>
                                )}
                              </div>
                              {hasFields && expandedFields.has(event.id) && (
                                <FieldDiffs fields={event.fields!} />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
