/**
 * JournalSection — interactive campaign-journal orchestrator. Owns its Card and
 * local state (busy/error/add/edit/delete) and wires the plain-REST journal CRUD
 * client functions, mirroring how InventoryList/SpellsSection own their surface.
 * Journal entries carry no mechanical effect, so there's no transaction/audit
 * pattern here — each call returns the full updated Character via onUpdate.
 *
 * Edit and delete are inline (an expand-in-place panel / an inline confirm row),
 * never a Modal — see CLAUDE.md on the inline-vs-Modal rule.
 */

import { useState } from "react";

import {
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
} from "@/api/client";
import Card from "@/components/ui/Card";
import JournalEntryPanel, {
  type JournalEntryDraft,
} from "@/features/character-meta/JournalEntryPanel";
import type { Character } from "@/types/character";

interface JournalSectionProps {
  character: Character;
  onUpdate: (character: Character) => void;
}

/**
 * Format an ISO date string for display, e.g. "Jun 22, 2026". Journal dates are
 * calendar dates with no meaningful time-of-day: the backend stores the picked
 * day at UTC midnight, so we MUST format in UTC. Formatting in local time would
 * shift the day backwards for timezones behind UTC (e.g. "Jun 22" → "Jun 21").
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function JournalSection({ character, onUpdate }: JournalSectionProps) {
  const entries = character.journal;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Render newest-first. The API already orders by createdAt desc, but sort
  // again defensively so an optimistic re-order can't surprise the view.
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  async function run(action: () => Promise<Character>) {
    setBusy(true);
    setError(null);
    try {
      const updated = await action();
      onUpdate(updated);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(draft: JournalEntryDraft) {
    const ok = await run(() => createJournalEntry(character.id, draft));
    if (ok) setAddPanelOpen(false);
  }

  async function handleEdit(entryId: string, draft: JournalEntryDraft) {
    const ok = await run(() => updateJournalEntry(character.id, entryId, draft));
    if (ok) setEditingId(null);
  }

  async function handleDelete(entryId: string) {
    const ok = await run(() => deleteJournalEntry(character.id, entryId));
    if (ok) setConfirmDeleteId(null);
  }

  return (
    <Card
      title="Journal"
      titleAccessory={
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setConfirmDeleteId(null);
            setAddPanelOpen((open) => !open);
          }}
          className="text-xs font-semibold text-garnet-700 hover:underline"
        >
          {addPanelOpen ? "Cancel" : "+ Add entry"}
        </button>
      }
      className="p-4"
    >
      <div className="flex flex-col gap-3">
        {error && (
          <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
            {error}
          </p>
        )}

        {addPanelOpen && (
          <JournalEntryPanel
            mode="add"
            busy={busy}
            onSubmit={handleAdd}
            onClose={() => setAddPanelOpen(false)}
          />
        )}

        {sortedEntries.length === 0 && !addPanelOpen ? (
          <p className="px-4 py-6 text-center text-sm text-parchment-500">
            No journal entries yet. Notes from your sessions will show up here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-parchment-200">
            {sortedEntries.map((entry) =>
              editingId === entry.id ? (
                <li key={entry.id} className="py-3">
                  <JournalEntryPanel
                    mode="edit"
                    initial={entry}
                    busy={busy}
                    onSubmit={(draft) => handleEdit(entry.id, draft)}
                    onClose={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li key={entry.id} className="py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-display text-base font-semibold text-parchment-900">
                      {entry.title}
                    </p>
                    <span className="whitespace-nowrap text-xs text-parchment-500">
                      {formatDate(entry.date)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-parchment-700">
                    {entry.body}
                  </p>

                  {confirmDeleteId === entry.id ? (
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <span className="text-garnet-700">Delete this entry?</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDelete(entry.id)}
                        className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="font-semibold text-parchment-500 hover:underline"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setAddPanelOpen(false);
                          setConfirmDeleteId(null);
                          setEditingId(entry.id);
                        }}
                        className="font-semibold text-garnet-700 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setConfirmDeleteId(entry.id);
                        }}
                        className="font-semibold text-parchment-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}
