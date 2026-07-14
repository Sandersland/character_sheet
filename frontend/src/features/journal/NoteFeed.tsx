// The NOTE feed rows shared by both quick-capture surfaces (#865). Two layouts:
//   - NoteFeed: the mobile BottomSheet list — newest-first, divided rows.
//   - DockFeed: the desktop margin dock — newest at BOTTOM, grouped under day
//     dividers, serif body to match the ruled writing register.
// Both reuse NoteRow/NoteEditor + a single edit/delete state machine so inline
// edit and confirm-in-place delete behave identically across surfaces.

import { useState } from "react";

import { Lock } from "@/components/ui/icons";
import MentionText from "@/features/journal/MentionText";
import { formatJournalTime } from "@/lib/formatJournalDate";
import type { CampaignEntity, EntryVisibility, JournalEntry } from "@/types/character";

type NotePatch = { body: string; visibility?: EntryVisibility };

// text-base at mobile widths keeps typed inputs ≥16px so iOS Safari doesn't auto-zoom on focus.
const editInputCls =
  "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-base md:text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";

// The visibility opt-out checkbox, shared by the composer and the inline editor.
export function PrivateToggle({
  checked,
  onChange,
  label = "Private (only you can see this note)",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label className="flex w-fit items-center gap-1.5 text-xs text-parchment-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-garnet-600"
      />
      {label}
    </label>
  );
}

// One edit/confirm-delete selection, shared by both feeds. Starting one action
// cancels the other so a row is never editing and delete-confirming at once.
function useFeedRowState() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  return {
    editingId,
    confirmingDeleteId,
    startEdit(id: string) {
      setConfirmingDeleteId(null);
      setEditingId(id);
    },
    stopEdit: () => setEditingId(null),
    startDelete(id: string) {
      setEditingId(null);
      setConfirmingDeleteId(id);
    },
    cancelDelete: () => setConfirmingDeleteId(null),
  };
}

interface RowCallbacks {
  onEditSave: (entryId: string, patch: NotePatch) => Promise<boolean>;
  onDelete: (entryId: string) => Promise<boolean>;
}

// Inline editor for one feed note; keyed by note id so it mounts fresh per edit.
// In a campaign the patch always carries an explicit visibility (mirrors
// JournalEntryPanel); campaign-less edits omit it (the server keeps PRIVATE).
function NoteEditor({
  note,
  rows,
  busy,
  campaignId,
  onSave,
  onCancel,
}: {
  note: JournalEntry;
  rows: number;
  busy: boolean;
  campaignId?: string | null;
  onSave: (patch: NotePatch) => void;
  onCancel: () => void;
}) {
  const [editValue, setEditValue] = useState(note.body);
  const [isPrivate, setIsPrivate] = useState(note.visibility === "PRIVATE");

  function handleSave() {
    const body = editValue.trim();
    if (body === "") return;
    onSave({
      body,
      ...(campaignId ? { visibility: (isPrivate ? "PRIVATE" : "CAMPAIGN") as EntryVisibility } : {}),
    });
  }

  return (
    <div className="flex flex-col gap-1 py-2">
      <textarea
        rows={rows}
        aria-label="Edit note"
        className={`${editInputCls} resize-y`}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
      />
      {campaignId && <PrivateToggle checked={isPrivate} onChange={setIsPrivate} />}
      <div className="flex gap-3 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={handleSave}
          className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-semibold text-parchment-600 hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Edit/Delete controls + the two-click delete confirm, shared by both row layouts.
function RowActions({
  busy,
  confirmingDelete,
  onDelete,
  onDeleteStart,
  onDeleteCancel,
  onEditStart,
}: {
  busy: boolean;
  confirmingDelete: boolean;
  onDelete: () => void;
  onDeleteStart: () => void;
  onDeleteCancel: () => void;
  onEditStart: () => void;
}) {
  if (confirmingDelete) {
    return (
      <>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
        >
          Delete?
        </button>
        <button
          type="button"
          onClick={onDeleteCancel}
          className="text-xs font-semibold text-parchment-600 hover:underline"
        >
          Cancel
        </button>
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={onEditStart}
        className="text-xs font-semibold text-garnet-700 hover:underline"
      >
        Edit
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onDeleteStart}
        className="text-xs font-semibold text-parchment-600 hover:underline disabled:opacity-40"
      >
        Delete
      </button>
    </>
  );
}

interface NoteRowProps {
  note: JournalEntry;
  entities: Map<string, CampaignEntity>;
  campaignId?: string | null;
  busy: boolean;
  bodyClassName: string;
  confirmingDelete: boolean;
  onDelete: () => void;
  onDeleteStart: () => void;
  onDeleteCancel: () => void;
  onEditStart: () => void;
}

// One display row of the feed: body, private lock, timestamp, edit/delete actions.
function NoteRow({ note, entities, campaignId, busy, bodyClassName, ...actions }: NoteRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <MentionText
        body={note.body}
        entities={entities}
        campaignId={campaignId}
        className={`min-w-0 flex-1 whitespace-pre-wrap ${bodyClassName}`}
      />
      <div className="flex shrink-0 items-center gap-3">
        {note.visibility === "PRIVATE" && (
          <Lock
            role="img"
            aria-label="Private note"
            className="h-3.5 w-3.5 shrink-0 text-parchment-500"
          />
        )}
        <span className="whitespace-nowrap text-xs text-parchment-500">
          {formatJournalTime(note.loggedAt)}
        </span>
        <RowActions busy={busy} {...actions} />
      </div>
    </div>
  );
}

interface FeedProps extends RowCallbacks {
  notes: JournalEntry[];
  entities: Map<string, CampaignEntity>;
  campaignId?: string | null;
  busy: boolean;
}

// Render one note as an editor row or a display row, wired to the shared state.
function renderRow(
  note: JournalEntry,
  props: FeedProps,
  rowState: ReturnType<typeof useFeedRowState>,
  bodyClassName: string,
  editorRows: number,
) {
  const { entities, campaignId, busy, onEditSave, onDelete } = props;
  if (rowState.editingId === note.id) {
    return (
      <NoteEditor
        note={note}
        rows={editorRows}
        busy={busy}
        campaignId={campaignId}
        onSave={async (patch) => {
          if (await onEditSave(note.id, patch)) rowState.stopEdit();
        }}
        onCancel={rowState.stopEdit}
      />
    );
  }
  return (
    <NoteRow
      note={note}
      entities={entities}
      campaignId={campaignId}
      busy={busy}
      bodyClassName={bodyClassName}
      confirmingDelete={rowState.confirmingDeleteId === note.id}
      onDelete={async () => {
        if (await onDelete(note.id)) rowState.cancelDelete();
      }}
      onDeleteStart={() => rowState.startDelete(note.id)}
      onDeleteCancel={rowState.cancelDelete}
      onEditStart={() => rowState.startEdit(note.id)}
    />
  );
}

// Mobile BottomSheet list: newest-first, hairline-divided sans rows.
export function NoteFeed(props: FeedProps) {
  const rowState = useFeedRowState();
  if (props.notes.length === 0) {
    return <p className="text-sm text-parchment-500">No notes captured yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-parchment-200">
      {props.notes.map((note) => (
        <li key={note.id}>{renderRow(note, props, rowState, "text-sm text-parchment-800", 3)}</li>
      ))}
    </ul>
  );
}

// Local-calendar day key/label for the dock's day dividers. loggedAt is a real
// timestamp (unlike the UTC-midnight `date`), so group by the LOCAL day.
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const dayMs = 86_400_000;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOfDay(today) - startOfDay(d)) / dayMs);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="h-px flex-1 bg-parchment-200" />
      <span className="h-1.5 w-1.5 rotate-45 bg-gold-600/70" aria-hidden="true" />
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-parchment-400">
        {label}
      </span>
      <span className="h-1.5 w-1.5 rotate-45 bg-gold-600/70" aria-hidden="true" />
      <span className="h-px flex-1 bg-parchment-200" />
    </div>
  );
}

// Group ascending notes under their day, so each divider precedes that day's rows.
function groupByDay(notes: JournalEntry[]): { key: string; label: string; notes: JournalEntry[] }[] {
  const groups: { key: string; label: string; notes: JournalEntry[] }[] = [];
  for (const note of notes) {
    const key = dayKey(note.loggedAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.notes.push(note);
    else groups.push({ key, label: dayLabel(note.loggedAt), notes: [note] });
  }
  return groups;
}

// Desktop margin dock: newest at the BOTTOM, grouped under day dividers, serif body.
export function DockFeed(props: FeedProps) {
  const rowState = useFeedRowState();
  if (props.notes.length === 0) {
    return (
      <p className="py-2 font-display text-[15px] italic text-parchment-500">
        No notes yet — jot the first below.
      </p>
    );
  }
  // props.notes arrives newest-first; reverse to oldest-first so newest lands last.
  const ascending = [...props.notes].reverse();
  return (
    <div className="flex flex-col">
      {groupByDay(ascending).map((group) => (
        <div key={group.key} className="flex flex-col">
          <DayDivider label={group.label} />
          {group.notes.map((note) => (
            <div key={note.id}>
              {renderRow(note, props, rowState, "font-display text-[15px] leading-snug text-parchment-800", 3)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
