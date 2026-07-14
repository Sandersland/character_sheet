// The manuscript "page" of the field chronicle (#864): the reading + writing
// surface for one selected chapter. A centered chapter heading (overline, serif
// title, ornamental rule + gold diamond) sits over the chapter's ENTRY rows —
// rendered as serif prose with a drop cap — and its NOTE rows as a "Field notes"
// list with margin timestamps and a lock glyph for private notes. Inked @-mentions
// come from MentionText. Writing happens through a bottom NOTE composer and a
// "＋ New entry" long-form flow; edit/delete are inline (never a Modal).

import { useEffect, useRef, useState } from "react";

import { Lock, Plus } from "@/components/ui/icons";
import JournalEntryPanel, { type JournalEntryDraft } from "@/features/journal/JournalEntryPanel";
import MentionAutocomplete from "@/features/journal/MentionAutocomplete";
import MentionText from "@/features/journal/MentionText";
import { useJournalMutations } from "@/features/journal/useJournalMutations";
import type { ChronicleChapter } from "@/features/journal/chronicle";
import { formatJournalDate, formatJournalTime } from "@/lib/formatJournalDate";
import type { CampaignEntity, Character, EntryVisibility, JournalEntry } from "@/types/character";

interface ManuscriptPageProps {
  character: Character;
  chapter: ChronicleChapter;
  entities: Map<string, CampaignEntity>;
  onUpdate: (character: Character) => void;
  /** True when this character participates in the session (may rename the chapter). */
  canRename: boolean;
  /** Persist a new chapter title (PATCH session); resolves true on success. */
  onRename: (title: string) => Promise<boolean>;
}

const DROP_CAP =
  "first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:font-display first-letter:text-[3.4rem] first-letter:font-semibold first-letter:leading-[0.72] first-letter:text-garnet-700";

const ORNAMENT = (
  <div className="flex items-center gap-3">
    <div className="h-px flex-1 bg-parchment-200" />
    <div className="h-[7px] w-[7px] rotate-45 bg-gold-600" />
    <div className="h-px flex-1 bg-parchment-200" />
  </div>
);

// Shared row-level UI state: which row is open for edit / delete-confirm.
interface RowState {
  editingId: string | null;
  confirmDeleteId: string | null;
  startEdit: (id: string) => void;
  startDelete: (id: string) => void;
  cancel: () => void;
}

export default function ManuscriptPage({
  character,
  chapter,
  entities,
  onUpdate,
  canRename,
  onRename,
}: ManuscriptPageProps) {
  const { busy, error, create, update, remove } = useJournalMutations(character.id, onUpdate);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [entryPanelOpen, setEntryPanelOpen] = useState(false);

  const { entries, notes } = splitChapterEntries(character.journal, chapter);

  async function handleCreate(draft: JournalEntryDraft): Promise<boolean> {
    const ok = await create({ ...draft, ...(chapter.sessionId ? { sessionId: chapter.sessionId } : {}) });
    if (ok) setEntryPanelOpen(false);
    return ok;
  }

  async function handleEdit(entry: JournalEntry, draft: JournalEntryDraft) {
    const patch: { body: string; date?: string; visibility?: EntryVisibility } = { body: draft.body };
    if (draft.date) patch.date = draft.date;
    if (draft.visibility) patch.visibility = draft.visibility;
    if (await update(entry.id, patch)) setEditingId(null);
  }

  async function handleDelete(entryId: string) {
    if (await remove(entryId)) setConfirmDeleteId(null);
  }

  const rowState: RowState = {
    editingId,
    confirmDeleteId,
    startEdit: (id) => {
      setConfirmDeleteId(null);
      setEntryPanelOpen(false);
      setEditingId(id);
    },
    startDelete: (id) => {
      setEditingId(null);
      setConfirmDeleteId(id);
    },
    cancel: () => {
      setEditingId(null);
      setConfirmDeleteId(null);
    },
  };

  const editPanelProps = {
    busy,
    campaignId: character.campaignId,
    entities,
    onEdit: handleEdit,
    onEditClose: () => setEditingId(null),
    onDeleteConfirm: handleDelete,
  };

  return (
    <div className="flex min-h-[36rem] flex-col rounded-card bg-parchment-50 p-6 shadow-card md:p-12">
      <ChronicleHeader chapter={chapter} canRename={canRename} busy={busy} onRename={onRename} />

      {error && (
        <p className="mb-4 rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {error}
        </p>
      )}

      {entryPanelOpen && (
        <JournalEntryPanel
          mode="add"
          kind="ENTRY"
          busy={busy}
          campaignId={character.campaignId}
          onSubmit={handleCreate}
          onClose={() => setEntryPanelOpen(false)}
        />
      )}

      {entries.length === 0 && notes.length === 0 && !entryPanelOpen && (
        <p className="font-display text-[16.5px] italic leading-relaxed text-parchment-500">
          This chapter is unwritten. Add the first note below, or start a full entry.
        </p>
      )}

      <EntryList entries={entries} row={rowState} {...editPanelProps} />
      <FieldNotes notes={notes} row={rowState} {...editPanelProps} />

      <div className="mt-auto pt-6">
        <ChapterComposer
          campaignId={character.campaignId}
          busy={busy}
          onSave={(body, visibility) =>
            handleCreate({ kind: "NOTE", body, ...(visibility ? { visibility } : {}) })
          }
        />
        {!entryPanelOpen && (
          <button
            type="button"
            onClick={() => {
              rowState.cancel();
              setEntryPanelOpen(true);
            }}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-garnet-700 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> New entry
          </button>
        )}
      </div>
    </div>
  );
}

// The chapter's ENTRY rows (prose) and NOTE rows (field notes), each already
// sorted for reading: prose oldest-first, field notes chronological.
function splitChapterEntries(journal: JournalEntry[], chapter: ChronicleChapter) {
  const chapterEntries = journal.filter((e) =>
    chapter.sessionId ? e.sessionId === chapter.sessionId : !e.sessionId,
  );
  const entries = chapterEntries
    .filter((e) => e.kind === "ENTRY")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const notes = chapterEntries
    .filter((e) => e.kind === "NOTE")
    .sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime());
  return { entries, notes };
}

interface EditPanelProps {
  busy: boolean;
  campaignId?: string | null;
  entities: Map<string, CampaignEntity>;
  onEdit: (entry: JournalEntry, draft: JournalEntryDraft) => void;
  onEditClose: () => void;
  onDeleteConfirm: (entryId: string) => void;
}

function ChronicleHeader({
  chapter,
  canRename,
  busy,
  onRename,
}: {
  chapter: ChronicleChapter;
  canRename: boolean;
  busy: boolean;
  onRename: (title: string) => Promise<boolean>;
}) {
  const overline =
    chapter.sessionNumber != null && chapter.startedAt
      ? `Session ${chapter.sessionNumber} · played ${formatJournalDate(chapter.startedAt)}`
      : "Loose notes";
  return (
    <header className="mb-8 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-parchment-500">
        {overline}
      </div>
      <ChapterTitle title={chapter.title} canRename={canRename} busy={busy} onRename={onRename} />
      {chapter.sessionId == null && (
        <div className="mb-5 font-display text-sm italic text-parchment-600">
          Notes not tied to a session
        </div>
      )}
      {ORNAMENT}
    </header>
  );
}

// ENTRY prose — the first paragraph carries a drop cap.
function EntryList({
  entries,
  row,
  ...panel
}: { entries: JournalEntry[]; row: RowState } & EditPanelProps) {
  return (
    <>
      {entries.map((entry, index) =>
        row.editingId === entry.id ? (
          <div key={entry.id} className="mb-6">
            <JournalEntryPanel
              mode="edit"
              kind="ENTRY"
              initial={entry}
              busy={panel.busy}
              campaignId={panel.campaignId}
              onSubmit={(draft) => panel.onEdit(entry, draft)}
              onClose={panel.onEditClose}
            />
          </div>
        ) : (
          <div key={entry.id} className="group mb-6">
            <MentionText
              body={entry.body}
              entities={panel.entities}
              campaignId={panel.campaignId}
              className={`whitespace-pre-wrap font-display text-[16.5px] leading-[1.65] text-parchment-900 ${
                index === 0 ? DROP_CAP : ""
              }`}
            />
            <RowActions entry={entry} row={row} busy={panel.busy} onDeleteConfirm={panel.onDeleteConfirm} />
          </div>
        ),
      )}
    </>
  );
}

// Field notes — the fast in-session NOTE rows with margin timestamps.
function FieldNotes({
  notes,
  row,
  ...panel
}: { notes: JournalEntry[]; row: RowState } & EditPanelProps) {
  if (notes.length === 0) return null;
  return (
    <>
      <div className="mb-1 mt-6 flex items-center gap-3.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-parchment-500">
          Field notes
        </div>
        <div className="h-px flex-1 bg-parchment-200" />
      </div>
      <ul>
        {notes.map((note) =>
          row.editingId === note.id ? (
            <li key={note.id} className="py-3">
              <JournalEntryPanel
                mode="edit"
                kind="NOTE"
                initial={note}
                busy={panel.busy}
                campaignId={panel.campaignId}
                onSubmit={(draft) => panel.onEdit(note, draft)}
                onClose={panel.onEditClose}
              />
            </li>
          ) : (
            <li key={note.id} className="group flex items-baseline gap-4 border-b border-parchment-100 py-2.5">
              <span className="w-16 shrink-0 text-right text-[11px] text-parchment-400">
                {formatJournalTime(note.loggedAt)}
              </span>
              <div className="min-w-0 flex-1">
                <span className="align-baseline">
                  <MentionText
                    body={note.body}
                    entities={panel.entities}
                    campaignId={panel.campaignId}
                    className="inline whitespace-pre-wrap font-display text-[15.5px] leading-[1.5] text-parchment-900"
                  />
                  {note.visibility === "PRIVATE" && (
                    <Lock role="img" aria-label="Private note" className="ml-2 inline h-3 w-3 text-parchment-500" />
                  )}
                </span>
                <RowActions entry={note} row={row} busy={panel.busy} onDeleteConfirm={panel.onDeleteConfirm} />
              </div>
            </li>
          ),
        )}
      </ul>
    </>
  );
}

// The centered chapter title, editable in place by a session participant.
function ChapterTitle({
  title,
  canRename,
  busy,
  onRename,
}: {
  title: string;
  canRename: boolean;
  busy: boolean;
  onRename: (title: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <div className="my-1 flex items-center justify-center gap-2">
        <h1 className="font-display text-3xl font-semibold text-parchment-900">{title}</h1>
        {canRename && (
          <button
            type="button"
            onClick={() => {
              setValue(title);
              setEditing(true);
            }}
            className="text-xs font-semibold text-garnet-700 hover:underline"
          >
            Rename
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      className="my-2 flex items-center justify-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const next = value.trim();
        if (next === "" || busy) return;
        if (await onRename(next)) setEditing(false);
      }}
    >
      <input
        ref={inputRef}
        aria-label="Chapter title"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full max-w-md rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-center font-display text-2xl font-semibold text-parchment-900 focus:border-garnet-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(title);
          setEditing(false);
        }}
        className="text-xs font-semibold text-parchment-600 hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}

// Inline edit/delete affordances for a prose entry or a field note.
function RowActions({
  entry,
  row,
  busy,
  onDeleteConfirm,
}: {
  entry: JournalEntry;
  row: RowState;
  busy: boolean;
  onDeleteConfirm: (entryId: string) => void;
}) {
  if (row.confirmDeleteId === entry.id) {
    return (
      <div className="mt-1 flex items-center gap-3 text-xs">
        <span className="text-garnet-700">Delete this {entry.kind === "ENTRY" ? "entry" : "note"}?</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDeleteConfirm(entry.id)}
          className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
        >
          Delete
        </button>
        <button type="button" onClick={row.cancel} className="font-semibold text-parchment-600 hover:underline">
          Keep
        </button>
      </div>
    );
  }
  return (
    <div className="mt-1 flex gap-3 text-xs opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        onClick={() => row.startEdit(entry.id)}
        className="font-semibold text-garnet-700 hover:underline"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => row.startDelete(entry.id)}
        className="font-semibold text-parchment-600 hover:underline"
      >
        Delete
      </button>
    </div>
  );
}

// Bottom inline NOTE composer — Enter saves, Shift+Enter newlines (mirrors CapturePalette).
function ChapterComposer({
  campaignId,
  busy,
  onSave,
}: {
  campaignId?: string | null;
  busy: boolean;
  onSave: (body: string, visibility?: EntryVisibility) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  async function save() {
    const body = value.trim();
    if (body === "" || busy) return;
    if (await onSave(body, isPrivate ? "PRIVATE" : undefined)) {
      setValue("");
      setIsPrivate(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-2.5">
        <MentionAutocomplete
          rows={1}
          aria-label="Add to this chapter"
          campaignId={campaignId}
          className="text-base md:text-sm text-parchment-900"
          placeholder="Add to this chapter… @ to tag"
          value={value}
          onChange={setValue}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void save();
            }
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-parchment-400">Enter to save · Shift+Enter for a new line</span>
        {campaignId && (
          <label className="flex items-center gap-1.5 text-xs text-parchment-600">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="h-3.5 w-3.5 accent-garnet-600"
            />
            Private
          </label>
        )}
      </div>
    </div>
  );
}
