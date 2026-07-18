import { useCallback, useEffect, useState } from "react";

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
import { toggledSet } from "@/lib/toggleSet";
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

// The batch shape groupByBatch produces for this timeline (rows are CharacterEvents).
type TimelineBatch = { key: string; createdAt: string; rows: CharacterEvent[] };

// One event row: badge + summary + optional field-diff toggle. Extracted so the
// modal's render tree stays shallow (the nested date→batch→row maps were the
// source of its complexity).
function ActivityEventRow({
  event,
  allReverted,
  expanded,
  onToggle,
}: {
  event: CharacterEvent;
  allReverted: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  const hasFields = !!event.fields?.length;
  const showFields = hasFields && expanded;
  return (
    <li className={`flex flex-col text-sm transition-opacity ${allReverted ? "opacity-40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={categoryTone(event.category)}>{eventTypeLabel(event.type)}</Badge>
          <span className="text-parchment-900">{event.summary}</span>
          {event.reverted && <Badge tone="neutral">reverted</Badge>}
        </span>
        {hasFields && (
          <button
            type="button"
            onClick={() => onToggle(event.id)}
            className="shrink-0 text-xs text-parchment-600 hover:text-parchment-700"
            aria-label={expanded ? "Hide field changes" : "Show field changes"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>
      {showFields && <FieldDiffs fields={event.fields!} />}
    </li>
  );
}

// One batch: an optional undo affordance, then either the collapsed bulk-sale
// summary line or the expanded per-event list.
function ActivityBatchGroup({
  batch,
  isUndoable,
  undoing,
  onUndo,
  expandedFields,
  onToggleFields,
  batchExpanded,
  onToggleBatch,
}: {
  batch: TimelineBatch;
  isUndoable: boolean;
  undoing: boolean;
  onUndo: (key: string) => void;
  expandedFields: Set<string>;
  onToggleFields: (id: string) => void;
  batchExpanded: boolean;
  onToggleBatch: (key: string) => void;
}) {
  const allReverted = batch.rows.every((r) => r.reverted);
  // A bulk sale (>1 row, all `sold`) collapses to one summary line unless expanded.
  const sell = summarizeSellBatch(batch.rows);
  const collapsed = sell !== null && !batchExpanded;
  return (
    <li>
      {isUndoable && (
        <div className="mb-1 flex justify-end">
          <button
            type="button"
            disabled={undoing}
            onClick={() => onUndo(batch.key)}
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
            onClick={() => onToggleBatch(batch.key)}
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
                onClick={() => onToggleBatch(batch.key)}
                className="text-xs text-parchment-600 hover:text-parchment-700"
                aria-label="Collapse sold items"
              >
                ▲
              </button>
            </li>
          )}
          {batch.rows.map((event) => (
            <ActivityEventRow
              key={event.id}
              event={event}
              allReverted={allReverted}
              expanded={expandedFields.has(event.id)}
              onToggle={onToggleFields}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// Whether any filter predicate is active (disables the undo affordance, and
// changes the empty-state copy).
function hasActiveFilters(f: {
  categoryFilter: string;
  typeFilter: string | null;
  sessionFilter: string;
  entityId?: string;
}): boolean {
  return f.categoryFilter !== "all" || f.typeFilter !== null || f.sessionFilter !== "" || !!f.entityId;
}

// A superseded load is aborted via its AbortSignal; that rejection is expected
// and must not surface as an error banner.
function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (err instanceof DOMException && err.name === "AbortError");
}

// The most-recent fully-unreverted batch is the only one eligible for undo — but
// only against the FULL, unfiltered timeline. Under any active filter the top
// batch may not be the global most-recent one, so the server's LIFO guard would
// reject with 409; hide the affordance (return null) instead.
function pickUndoableBatchKey(batches: TimelineBatch[], filtersActive: boolean): string | null {
  if (filtersActive) return null;
  return batches.find((b) => b.rows.every((r) => !r.reverted))?.key ?? null;
}

// Only defined filters are forwarded so an unfiltered load sends exactly
// { includeFields: true }; typed to fetchActivity's query param so it stays in sync.
function buildActivityQuery(filters: {
  categoryFilter: string;
  typeFilter: string | null;
  sessionFilter: string;
  entityId?: string;
}): Parameters<typeof fetchActivity>[1] {
  return {
    includeFields: true,
    ...(filters.categoryFilter !== "all" ? { category: filters.categoryFilter } : {}),
    ...(filters.typeFilter ? { type: filters.typeFilter } : {}),
    ...(filters.sessionFilter ? { sessionId: filters.sessionFilter } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
  };
}

// The filter bar: category + session selects (a matched pair) plus the
// inventory-only event-type chips. Extracted so the modal render stays flat.
function ActivityFilters({
  categoryFilter,
  onSelectCategory,
  sessions,
  sessionFilter,
  onSessionFilterChange,
  typeFilter,
  onToggleType,
}: {
  categoryFilter: string;
  onSelectCategory: (id: string) => void;
  sessions: Session[];
  sessionFilter: string;
  onSessionFilterChange: (id: string) => void;
  typeFilter: string | null;
  onToggleType: (type: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Category + Session as a matched pair of compact selects. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-parchment-600">
          <span className="font-semibold">Category</span>
          <select
            value={categoryFilter}
            onChange={(e) => onSelectCategory(e.target.value)}
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
              onChange={(e) => onSessionFilterChange(e.target.value)}
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
                onClick={() => onToggleType(type)}
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
  );
}

// The load/empty/error banners shown above the timeline list.
function ActivityStatus({
  events,
  error,
  showSpinner,
  filtersActive,
  undoError,
}: {
  events: CharacterEvent[] | null;
  error: string | null;
  showSpinner: boolean;
  filtersActive: boolean;
  undoError: string | null;
}) {
  return (
    <>
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
      {events === null && !error && showSpinner && <Spinner />}
      {events !== null && events.length === 0 && (
        <p className="py-6 text-center text-sm text-parchment-600">
          {filtersActive ? "No activity matches the current filters." : "No activity yet."}
        </p>
      )}
      {undoError && <p className="text-xs font-semibold text-garnet-700">{undoError}</p>}
    </>
  );
}

interface ActivityFilterState {
  characterId: string;
  categoryFilter: string;
  typeFilter: string | null;
  sessionFilter: string;
  entityId?: string;
}

// Owns the activity timeline load: fetches (with field-level diffs) on mount and
// whenever a filter/character changes, and exposes `reload` for the undo handler.
// Only defined filters are forwarded so an unfiltered load sends exactly
// { includeFields: true }. The AbortController teardown lets a superseded
// filter-change load be aborted so a slow stale response can't overwrite a
// fresher one. Extracted from ActivityModal so the modal component stays under
// the cognitive-complexity gate while keeping exhaustive-deps honest (#1056).
function useActivityEvents(filters: ActivityFilterState) {
  const { characterId, categoryFilter, typeFilter, sessionFilter, entityId } = filters;
  const [events, setEvents] = useState<CharacterEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    (signal?: AbortSignal) => {
      setEvents(null);
      setError(null);
      fetchActivity(
        characterId,
        buildActivityQuery({ categoryFilter, typeFilter, sessionFilter, entityId }),
        signal,
      )
        .then(setEvents)
        .catch((err) => {
          if (isAbortError(err, signal)) return; // superseded load — the newer one wins
          setError("Couldn't load the activity log — try again.");
        });
    },
    [characterId, categoryFilter, typeFilter, sessionFilter, entityId],
  );

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return { events, error, reload };
}

export default function ActivityModal({ characterId, onClose, onUpdate, entityId }: ActivityModalProps) {
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  // Bulk-sale summary collapse (issue #104). Keyed by batch.key, kept INDEPENDENT
  // of expandedFields (keyed by event.id) so the summary line and the per-row
  // field-diff toggles can't collide.
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  // Filter state. "all" category disables the category predicate; an empty
  // typeFilter/sessionFilter disables those. Type chips are inventory-only.
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<string>("");
  const [sessions, setSessions] = useState<Session[]>([]);

  const { events, error, reload } = useActivityEvents({
    characterId,
    categoryFilter,
    typeFilter,
    sessionFilter,
    entityId,
  });
  const showSpinner = useDelayedFlag(events === null && !error);

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
    setExpandedFields((prev) => toggledSet(prev, id));
  }

  function toggleBatch(key: string) {
    setExpandedBatches((prev) => toggledSet(prev, key));
  }

  async function handleUndo(batchId: string) {
    setUndoing(true);
    setUndoError(null);
    try {
      const updated = await revertBatch(characterId, batchId);
      onUpdate(updated);
      reload(); // Refresh the timeline so reverted events are dimmed.
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

  const filtersActive = hasActiveFilters({ categoryFilter, typeFilter, sessionFilter, entityId });
  const undoableBatchId = pickUndoableBatchKey(batches, filtersActive);

  return (
    <Modal title="Character Activity" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ActivityFilters
          categoryFilter={categoryFilter}
          onSelectCategory={selectCategory}
          sessions={sessions}
          sessionFilter={sessionFilter}
          onSessionFilterChange={setSessionFilter}
          typeFilter={typeFilter}
          onToggleType={toggleType}
        />

        <ActivityStatus
          events={events}
          error={error}
          showSpinner={showSpinner}
          filtersActive={filtersActive}
          undoError={undoError}
        />

        <ul className="flex flex-col gap-4">
          {dateGroups.map((group) => (
            <li key={group.label} className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
                {group.label}
              </p>
              <ul className="flex flex-col gap-3">
                {group.items.map((batch) => (
                  <ActivityBatchGroup
                    key={batch.key}
                    batch={batch}
                    isUndoable={batch.key === undoableBatchId}
                    undoing={undoing}
                    onUndo={handleUndo}
                    expandedFields={expandedFields}
                    onToggleFields={toggleFields}
                    batchExpanded={expandedBatches.has(batch.key)}
                    onToggleBatch={toggleBatch}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
