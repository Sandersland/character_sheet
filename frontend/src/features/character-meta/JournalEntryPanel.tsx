/**
 * JournalEntryPanel — inline expand-in-place form for adding or editing a
 * journal entry. Not a modal — the overlay primitive is reserved for read-only
 * review surfaces (see CLAUDE.md). Reused for both add and edit via `mode` +
 * `initial`; the parent (JournalSection) owns the API call and busy/error state.
 */

import { useState } from "react";

import MentionAutocomplete from "@/features/journal/MentionAutocomplete";
import type { JournalEntry } from "@/types/character";

export interface JournalEntryDraft {
  title: string;
  date: string; // yyyy-mm-dd (what <input type="date"> produces)
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

/**
 * Today's date as a yyyy-mm-dd string for the add-form default, built from the
 * user's LOCAL calendar components. Using toISOString() here would default to
 * the UTC day, which can be tomorrow during the evening in timezones behind UTC.
 */
function todayInputValue(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Coerce an API ISO date string to the yyyy-mm-dd a date input expects. */
function toInputDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? todayInputValue() : d.toISOString().slice(0, 10);
}

export default function JournalEntryPanel({
  mode,
  initial,
  busy,
  campaignId,
  onSubmit,
  onClose,
}: JournalEntryPanelProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial ? toInputDate(initial.date) : todayInputValue());
  const [body, setBody] = useState(initial?.body ?? "");

  const canSubmit = title.trim() !== "" && body.trim() !== "" && !busy;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ title: title.trim(), date, body: body.trim() });
  }

  const inputCls =
    "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";
  const labelCls = "block text-xs font-semibold text-parchment-700";

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-col gap-3 rounded-card border border-garnet-200 bg-garnet-50 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-garnet-900">
          {mode === "add" ? "New journal entry" : "Edit journal entry"}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="journal-title">
            Title *
          </label>
          <input
            id="journal-title"
            required
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Sunken Library"
          />
        </div>
        <div className="min-w-0">
          <label className={labelCls} htmlFor="journal-date">
            Date
          </label>
          <input
            id="journal-date"
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="journal-body">
          Notes *
        </label>
        <MentionAutocomplete
          id="journal-body"
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
          {busy ? "Saving…" : mode === "add" ? "Add entry" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
