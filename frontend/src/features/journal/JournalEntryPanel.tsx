/**
 * JournalEntryPanel — inline expand-in-place composer for adding or editing a
 * journal entry. Not a modal — the overlay primitive is reserved for read-only
 * review surfaces (see CLAUDE.md). Reused for add and edit via `mode` + `initial`,
 * and for both journal kinds via `kind`:
 *   • "NOTE" (default) — the fast, body-only, date-less capture used by
 *     JournalSection and the chronicle chapter's quick add.
 *   • "ENTRY" — the long-form flow behind the chronicle's "＋ New entry": adds a
 *     calendar date (required server-side for an ENTRY), rendered as prose with a
 *     drop cap on the manuscript page.
 * The parent owns the API call and busy/error state.
 */

import { useState } from "react";

import MentionAutocomplete from "@/features/journal/MentionAutocomplete";
import type { EntryVisibility, JournalEntry, JournalEntryKind } from "@/types/character";

export interface JournalEntryDraft {
  kind: JournalEntryKind;
  body: string;
  /** YYYY-MM-DD calendar date — present (and required) only for an ENTRY. */
  date?: string;
  /** Set only for campaign characters; campaign-less writes are always PRIVATE. */
  visibility?: EntryVisibility;
}

interface JournalEntryPanelProps {
  mode: "add" | "edit";
  /** Which journal kind this composer writes. Defaults to the body-only NOTE. */
  kind?: JournalEntryKind;
  /** Pre-fill values (edit mode, or to re-open a draft). */
  initial?: JournalEntry;
  busy: boolean;
  /** Campaign the character belongs to (enables @-tagging in the body). */
  campaignId?: string | null;
  onSubmit: (draft: JournalEntryDraft) => void;
  onClose: () => void;
}

// Today as a YYYY-MM-DD string in UTC, matching the backend's UTC-midnight dates.
function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

// text-base at mobile widths keeps the field ≥16px so iOS Safari doesn't auto-zoom on focus.
const INPUT_CLS =
  "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-base md:text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";
const LABEL_CLS = "block text-xs font-semibold text-parchment-700";

// Assemble the submit payload: a NOTE omits `date`; campaign-less writes omit
// `visibility` (the server coerces them to PRIVATE). Pure so it stays out of the
// component's branch budget.
function buildDraft(args: {
  kind: JournalEntryKind;
  isEntry: boolean;
  body: string;
  date: string;
  campaignId?: string | null;
  isPrivate: boolean;
}): JournalEntryDraft {
  const draft: JournalEntryDraft = { kind: args.kind, body: args.body.trim() };
  if (args.isEntry) draft.date = args.date;
  if (args.campaignId) draft.visibility = args.isPrivate ? "PRIVATE" : "CAMPAIGN";
  return draft;
}

// Ready to submit: a non-empty body, a date when the kind requires one, not busy.
function canSubmitDraft(body: string, isEntry: boolean, date: string, busy: boolean): boolean {
  return body.trim() !== "" && (!isEntry || date !== "") && !busy;
}

export default function JournalEntryPanel({
  mode,
  kind = "NOTE",
  initial,
  busy,
  campaignId,
  onSubmit,
  onClose,
}: JournalEntryPanelProps) {
  const isEntry = kind === "ENTRY";
  const noun = isEntry ? "entry" : "note";

  const [body, setBody] = useState(initial?.body ?? "");
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? todayYmd());
  const [isPrivate, setIsPrivate] = useState(initial?.visibility === "PRIVATE");

  const canSubmit = canSubmitDraft(body, isEntry, date, busy);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(buildDraft({ kind, isEntry, body, date, campaignId, isPrivate }));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-col gap-3 rounded-card border border-garnet-200 bg-garnet-50 p-4"
    >
      <PanelHeader mode={mode} noun={noun} onClose={onClose} />

      {isEntry && <DateField value={date} onChange={setDate} />}

      <BodyField isEntry={isEntry} campaignId={campaignId} value={body} onChange={setBody} />

      {campaignId && <PrivateToggle noun={noun} checked={isPrivate} onChange={setIsPrivate} />}

      <PanelFooter mode={mode} noun={noun} busy={busy} canSubmit={canSubmit} onClose={onClose} />
    </form>
  );
}

function PanelHeader({ mode, noun, onClose }: { mode: "add" | "edit"; noun: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-garnet-900">
        {mode === "add" ? `New ${noun}` : `Edit ${noun}`}
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
  );
}

function BodyField({
  isEntry,
  campaignId,
  value,
  onChange,
}: {
  isEntry: boolean;
  campaignId?: string | null;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label id="journal-body-label" className={LABEL_CLS} htmlFor="journal-body">
        {isEntry ? "Entry" : "Note"}
      </label>
      <MentionAutocomplete
        id="journal-body"
        aria-labelledby="journal-body-label"
        required
        rows={isEntry ? 6 : 4}
        campaignId={campaignId}
        className={`${INPUT_CLS} resize-y`}
        value={value}
        onChange={onChange}
        placeholder="What happened? Use @ to tag people, places and things"
      />
    </div>
  );
}

function PanelFooter({
  mode,
  noun,
  busy,
  canSubmit,
  onClose,
}: {
  mode: "add" | "edit";
  noun: string;
  busy: boolean;
  canSubmit: boolean;
  onClose: () => void;
}) {
  const submitLabel = busy ? "Saving…" : mode === "add" ? `Add ${noun}` : "Save changes";
  return (
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
        {submitLabel}
      </button>
    </div>
  );
}

function DateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label id="journal-date-label" className={LABEL_CLS} htmlFor="journal-date">
        Date
      </label>
      <input
        id="journal-date"
        aria-labelledby="journal-date-label"
        type="date"
        required
        className={INPUT_CLS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function PrivateToggle({
  noun,
  checked,
  onChange,
}: {
  noun: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex w-fit items-center gap-1.5 text-xs text-parchment-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-garnet-600"
      />
      Private (only you can see this {noun})
    </label>
  );
}
