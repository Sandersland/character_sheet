// Fast in-session note capture: auto-focused composer (Enter saves a NOTE, Shift+Enter newlines, Esc closes) over a per-session NOTE feed with edit/delete.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { createJournalEntry, deleteJournalEntry, updateJournalEntry } from "@/api/client";
import { formatJournalTime } from "@/lib/formatJournalDate";
import type { Character } from "@/types/character";

interface CapturePaletteProps {
  character: Character;
  /** Active session to scope the feed to; omitted shows all NOTE rows. */
  sessionId?: string;
  onClose: () => void;
  onUpdate: (character: Character) => void;
}

export default function CapturePalette({
  character,
  sessionId,
  onClose,
  onUpdate,
}: CapturePaletteProps) {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // The NOTE feed: newest-first, scoped to the active session when one is given.
  const notes = character.journal
    .filter((e) => e.kind === "NOTE" && (!sessionId || e.sessionId === sessionId))
    .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());

  // Auto-focus the composer and lock body scroll on mount (mirrors Modal).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    composerRef.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  async function run(action: () => Promise<Character>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await action());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    const body = value.trim();
    if (body === "" || busy) return;
    const ok = await run(() => createJournalEntry(character.id, { kind: "NOTE", body, sessionId }));
    if (ok) {
      setValue("");
      composerRef.current?.focus();
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter saves; Shift+Enter newlines; isComposing skips an IME-commit Enter.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSave();
    }
  }

  async function handleEditSave(entryId: string) {
    const body = editValue.trim();
    if (body === "") return;
    const ok = await run(() => updateJournalEntry(character.id, entryId, { body }));
    if (ok) setEditingId(null);
  }

  async function handleDelete(entryId: string) {
    const ok = await run(() => deleteJournalEntry(character.id, entryId));
    if (ok) setConfirmingDeleteId(null);
  }

  const inputCls =
    "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center bg-parchment-900/20 p-4 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick capture"
        className="flex max-h-[76vh] w-full max-w-2xl flex-col rounded-card border border-parchment-200 bg-parchment-50 shadow-raised"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-parchment-200 px-4 py-3">
          <h2 className="font-display text-lg font-semibold text-parchment-900">Quick capture</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-garnet-700 hover:underline"
          >
            Close
          </button>
        </div>

        <div className="flex shrink-0 flex-col gap-1 border-b border-parchment-200 p-4">
          <textarea
            ref={composerRef}
            rows={2}
            aria-label="Quick note"
            className={`${inputCls} resize-none`}
            placeholder="Jot a note… Enter to save, Shift+Enter for a new line"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleComposerKeyDown}
          />
          {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {notes.length === 0 ? (
            <p className="text-sm text-parchment-500">No notes captured yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-parchment-200">
              {notes.map((note) =>
                editingId === note.id ? (
                  <li key={note.id} className="py-2">
                    <textarea
                      rows={2}
                      aria-label="Edit note"
                      className={`${inputCls} resize-y`}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                    />
                    <div className="mt-1 flex gap-3 text-xs">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleEditSave(note.id)}
                        className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="font-semibold text-parchment-600 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={note.id} className="flex items-start justify-between gap-3 py-2">
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-parchment-800">
                      {note.body}
                    </p>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="whitespace-nowrap text-xs text-parchment-500">
                        {formatJournalTime(note.loggedAt)}
                      </span>
                      {confirmingDeleteId === note.id ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDelete(note.id)}
                            className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                          >
                            Delete?
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingDeleteId(null)}
                            className="text-xs font-semibold text-parchment-600 hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmingDeleteId(null);
                              setEditingId(note.id);
                              setEditValue(note.body);
                            }}
                            className="text-xs font-semibold text-garnet-700 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(null);
                              setConfirmingDeleteId(note.id);
                            }}
                            className="text-xs font-semibold text-parchment-600 hover:underline disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
