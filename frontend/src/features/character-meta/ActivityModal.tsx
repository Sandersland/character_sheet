import { useCallback, useEffect, useState } from "react";

import { fetchActivity, fetchSessions, revertBatch } from "@/api/client";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
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
import type { CharacterEvent, CharacterEventCategory, CharacterEventField, Session } from "@/types/character";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";

interface ActivityModalProps {
  characterId: string;
  onClose: () => void;
  entityId?: string;
}

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

type TimelineBatch = { key: string; createdAt: string; rows: CharacterEvent[] };

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

function hasActiveFilters(f: {
  categoryFilter: string;
  typeFilter: string | null;
  sessionFilter: string;
  entityId?: string;
}): boolean {
  return f.categoryFilter !== "all" || f.typeFilter !== null || f.sessionFilter !== "" || !!f.entityId;
}

// Aborting a superseded load rejects its promise; that rejection is expected, not an error.
function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (err instanceof DOMException && err.name === "AbortError");
}

// Under a filter the top batch might not be globally most-recent; the server's
// LIFO undo guard would 409 on it, so hide the affordance instead.
function pickUndoableBatchKey(batches: TimelineBatch[], filtersActive: boolean): string | null {
  if (filtersActive) return null;
  return batches.find((b) => b.rows.every((r) => !r.reverted))?.key ?? null;
}

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
          if (isAbortError(err, signal)) return;
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

export default function ActivityModal({ characterId, onClose, entityId }: ActivityModalProps) {
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  // Keyed independently from expandedFields (batch.key vs. event.id) so the two toggles can't collide.
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const undoMutation = useCharacterMutation({
    characterId,
    mutationFn: (batchId: string) => revertBatch(characterId, batchId),
    toCharacter: (c) => c,
    fallbackMessage: "Undo failed — try again.",
  });

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

  useEffect(() => {
    fetchSessions(characterId)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [characterId]);

  function selectCategory(id: string) {
    setCategoryFilter(id);
    // Reset the type predicate when leaving Inventory — a stale filter would otherwise hide everything silently.
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
    try {
      await undoMutation.mutateAsync(batchId);
      reload();
    } catch {
      // undoMutation.error already carries the message.
    }
  }

  const activeEvents = (events ?? []).filter((e) => e.type !== "revert");
  const batches = groupByBatch(activeEvents);
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
          undoError={undoMutation.error}
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
                    undoing={undoMutation.isPending}
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
