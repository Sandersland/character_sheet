import { useEffect, useState } from "react";

import { fetchActivity, revertBatch } from "@/api/client";
import { groupByBatch, groupByDate } from "@/lib/timeline";
import type { Character, CharacterEvent, CharacterEventCategory, CharacterEventField } from "@/types/character";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";

interface ActivityModalProps {
  characterId: string;
  onClose: () => void;
  /** Called with the refreshed character when an undo revert completes. */
  onUpdate: (character: Character) => void;
}

// Badge tone per event category — reuses the existing design tokens.
const CATEGORY_TONE: Record<CharacterEventCategory, "vitality" | "gold" | "garnet" | "neutral" | "arcane"> = {
  inventory: "gold",
  hitPoints: "vitality",
  experience: "arcane",
  currency: "gold",
  spellcasting: "arcane",
  class: "neutral",
  resources: "gold",
  combat: "garnet",
};

// Label per event type for the badge.
const TYPE_LABEL: Partial<Record<string, string>> = {
  acquired: "acquired",
  bought: "bought",
  sold: "sold",
  consumed: "consumed",
  removed: "removed",
  damage: "damage",
  heal: "healed",
  setTemp: "temp HP",
  shortRest: "short rest",
  longRest: "long rest",
  levelUp: "level up",
  levelDown: "level down",
  deathSave: "death save",
  stabilize: "stabilize",
  xpAward: "XP",
  xpSet: "XP set",
  currencyAdjust: "currency",
  castSpell: "cast",
  expendSlot: "slot used",
  restoreSlot: "slot restored",
  learnSpell: "learned",
  forgetSpell: "forgotten",
  prepareSpell: "prepared",
  unprepareSpell: "unprepared",
  concentrationDropped: "concentration dropped",
  revert: "undo",
};

function FieldDiffs({ fields }: { fields: CharacterEventField[] }) {
  if (fields.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 pl-4 text-xs text-parchment-500">
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

export default function ActivityModal({ characterId, onClose, onUpdate }: ActivityModalProps) {
  const [events, setEvents] = useState<CharacterEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  // Load events (with field-level diffs) on mount and after undo.
  function load() {
    setEvents(null);
    setError(null);
    fetchActivity(characterId, { includeFields: true })
      .then(setEvents)
      .catch(() => setError("Couldn't load the activity log — try again."));
  }

  useEffect(load, [characterId]);

  function toggleFields(id: string) {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  // The most-recent non-reverted batch is the only one eligible for undo.
  const undoableBatchId = batches.find((b) => b.rows.every((r) => !r.reverted))?.key ?? null;

  return (
    <Modal title="Character Activity" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}

        {events === null && !error && (
          <p className="text-sm text-parchment-500">Loading…</p>
        )}

        {events !== null && events.length === 0 && (
          <p className="py-6 text-center text-sm text-parchment-500">
            No activity yet. Actions like gaining XP, taking damage, buying items, and leveling up will appear here.
          </p>
        )}

        {undoError && (
          <p className="text-xs font-semibold text-garnet-700">{undoError}</p>
        )}

        <ul className="flex flex-col gap-4">
          {dateGroups.map((group) => (
            <li key={group.label} className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-parchment-500">
                {group.label}
              </p>
              <ul className="flex flex-col gap-3">
                {group.items.map((batch) => {
                  const isUndoable = batch.key === undoableBatchId;
                  const allReverted = batch.rows.every((r) => r.reverted);
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
                      <ul className="flex flex-col gap-1.5">
                        {batch.rows.map((event) => {
                          const hasFields = (event.fields?.length ?? 0) > 0;
                          const tone = CATEGORY_TONE[event.category] ?? "neutral";
                          const label = TYPE_LABEL[event.type] ?? event.type;
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
                                    className="shrink-0 text-xs text-parchment-400 hover:text-parchment-700"
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
