// The NOTE feed rows shared by both quick-capture surfaces (#865, #866). Two
// layouts, both newest at the BOTTOM, grouped under day dividers with a serif
// ink body to match the ruled writing register:
//   - MobileFeed: the full-height mobile capture (#866) — "Tonight ·" divider.
//   - DockFeed: the desktop margin dock (#865).
// Both reuse NoteRow/NoteEditor + a single edit/delete state machine so inline
// edit and confirm-in-place delete behave identically across surfaces.

import { useState } from "react";

import { Lock, Unlock } from "@/components/ui/icons";
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

// The visibility opt-out as a compact icon toggle — the mobile composer's lock
// button (#866), sitting beside the field in place of the checkbox+label row.
// A closed lock reads "private"; an open lock reads "shared" (the campaign
// default). ≥44px hit target; state announced via aria-pressed.
export function PrivateLockButton({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const Icon = checked ? Lock : Unlock;
  return (
    <button
      type="button"
      aria-label="Private"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border transition-colors ${
        checked
          ? "border-garnet-400 bg-garnet-50 text-garnet-700"
          : "border-parchment-300 bg-parchment-50 text-parchment-500"
      }`}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
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

type DayGroup = { key: string; label: string; notes: JournalEntry[] };

// Group ascending notes under their day, so each divider precedes that day's rows.
function groupByDay(notes: JournalEntry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const note of notes) {
    const key = dayKey(note.loggedAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.notes.push(note);
    else groups.push({ key, label: dayLabel(note.loggedAt), notes: [note] });
  }
  return groups;
}

// Mobile capture divider label: the current day reads "Tonight · {Mon D}" (notes
// are jotted during an evening session); earlier days fall back to the shared
// Today/Yesterday/absolute labels.
function mobileDayLabel(iso: string): string {
  const base = dayLabel(iso);
  if (base !== "Today") return base;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return base;
  return `Tonight · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

// The newest-at-bottom body shared by both surfaces (#865, #866): props.notes
// arrives newest-first, so reverse to oldest-first (newest lands last), group
// under day dividers, and render each row via the shared machinery. The caller
// supplies the divider labeller (dock = plain day; mobile = "Tonight ·") and the
// serif body class for its register.
function GroupedNoteFeed({
  props,
  bodyClassName,
  labelFor,
}: {
  props: FeedProps;
  bodyClassName: string;
  labelFor: (group: DayGroup) => string;
}) {
  const rowState = useFeedRowState();
  const ascending = [...props.notes].reverse();
  return (
    <div className="flex flex-col">
      {groupByDay(ascending).map((group) => (
        <div key={group.key} className="flex flex-col">
          <DayDivider label={labelFor(group)} />
          {group.notes.map((note) => (
            <div key={note.id}>{renderRow(note, props, rowState, bodyClassName, 3)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Mobile capture surface (#866): serif ink body, "Tonight ·" divider.
export function MobileFeed(props: FeedProps) {
  if (props.notes.length === 0) {
    return (
      <p className="py-4 text-center font-display text-[15px] italic text-parchment-500">
        No notes yet — jot the first below.
      </p>
    );
  }
  return (
    <GroupedNoteFeed
      props={props}
      bodyClassName="font-display text-base leading-[1.45] text-parchment-900"
      labelFor={(group) => mobileDayLabel(group.notes[0].loggedAt)}
    />
  );
}

// Desktop margin dock (#865): serif body, plain day dividers.
export function DockFeed(props: FeedProps) {
  if (props.notes.length === 0) {
    return (
      <p className="py-2 font-display text-[15px] italic text-parchment-500">
        No notes yet — jot the first below.
      </p>
    );
  }
  return (
    <GroupedNoteFeed
      props={props}
      bodyClassName="font-display text-[15px] leading-snug text-parchment-800"
      labelFor={(group) => group.label}
    />
  );
}
