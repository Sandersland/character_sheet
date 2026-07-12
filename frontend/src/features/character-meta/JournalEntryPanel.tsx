/**
 * JournalEntryPanel — inline expand-in-place composer for adding or editing a
 * journal NOTE. Not a modal — the overlay primitive is reserved for read-only
 * review surfaces (see CLAUDE.md). Body-only: each row is its own dated note,
 * no title. Reused for add and edit via `mode` + `initial`; the parent
 * (JournalSection) owns the API call and busy/error state.
 */

import { useState } from "react";

import MentionAutocomplete from "@/features/journal/MentionAutocomplete";
import type { JournalEntry } from "@/types/character";

export interface JournalEntryDraft {
  kind: "NOTE";
  body: string;
}

interface JournalEntryPanelProps {
  mode: "add" | "edit";
  /** Pre-fill values (edit mode, or to re-open a draft). */
  initial?: JournalEntry;
  busy: boolean;
  /** Campaign the character belongs to (enables @-tagging in the body). */
  campaignId?: string | null;
  onSubmit: (draft: JournalEntryDraft) => void;
  onClose: () => void;
}

export default function JournalEntryPanel({
  mode,
  initial,
  busy,
  campaignId,
  onSubmit,
  onClose,
}: JournalEntryPanelProps) {
  const [body, setBody] = useState(initial?.body ?? "");

  const canSubmit = body.trim() !== "" && !busy;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ kind: "NOTE", body: body.trim() });
  }

  // text-base at mobile widths keeps the note field ≥16px so iOS Safari doesn't auto-zoom on focus.
  const inputCls =
    "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-base md:text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";
  const labelCls = "block text-xs font-semibold text-parchment-700";

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-col gap-3 rounded-card border border-garnet-200 bg-garnet-50 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-garnet-900">
          {mode === "add" ? "New note" : "Edit note"}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-parchment-600 hover:text-parchment-700"
          aria-label="Close journal entry panel"
        >
          ✕
        </button>
      </div>

      <div>
        <label id="journal-body-label" className={labelCls} htmlFor="journal-body">
          Note
        </label>
        <MentionAutocomplete
          id="journal-body"
          aria-labelledby="journal-body-label"
          required
          rows={4}
          campaignId={campaignId}
          className={`${inputCls} resize-y`}
          value={body}
          onChange={setBody}
          placeholder="What happened? Use @ to tag people, places and things"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control px-3 py-1.5 text-xs font-semibold text-parchment-600 hover:text-parchment-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
        >
          {busy ? "Saving…" : mode === "add" ? "Add note" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
