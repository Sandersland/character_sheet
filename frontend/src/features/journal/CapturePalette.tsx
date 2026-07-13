// Fast in-session note capture: auto-focused composer (Enter saves a NOTE, Shift+Enter newlines, Esc closes) over a per-session NOTE feed with edit/delete.
// Per-breakpoint presentation (#771): a slide-up BottomSheet on mobile, the top-anchored command-palette overlay at md+.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import BottomSheet from "@/components/ui/BottomSheet";
import { Lock } from "@/components/ui/icons";
import MentionAutocomplete from "@/features/journal/MentionAutocomplete";
import MentionText from "@/features/journal/MentionText";
import { useJournalMutations } from "@/features/journal/useJournalMutations";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import { formatJournalTime } from "@/lib/formatJournalDate";
import type { CampaignEntity, Character, EntryVisibility, JournalEntry } from "@/types/character";

interface CapturePaletteProps {
  character: Character;
  /** Active session to scope the feed to; omitted shows all NOTE rows. */
  sessionId?: string;
  onClose: () => void;
  onUpdate: (character: Character) => void;
}

type NotePatch = { body: string; visibility?: EntryVisibility };

// text-base at mobile widths keeps typed inputs ≥16px so iOS Safari doesn't auto-zoom on focus.
const inputCls =
  "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-base md:text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";

export default function CapturePalette({
  character,
  sessionId,
  onClose,
  onUpdate,
}: CapturePaletteProps) {
  const composerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsBelowMd();
  const { byId } = useCampaignEntities(character.campaignId);
  const { busy, error, create, update, remove } = useJournalMutations(character.id, onUpdate);

  // The NOTE feed: newest-first, scoped to the active session when one is given.
  const notes = character.journal
    .filter((e) => e.kind === "NOTE" && (!sessionId || e.sessionId === sessionId))
    .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());

  useCapturePaletteFocus(composerRef, isMobile, onClose);

  async function handleSave(body: string, visibility?: EntryVisibility): Promise<boolean> {
    const ok = await create({ kind: "NOTE", body, sessionId, ...(visibility ? { visibility } : {}) });
    if (ok) composerRef.current?.focus({ preventScroll: true });
    return ok;
  }

  const composer = (
    <NoteComposer
      composerRef={composerRef}
      isMobile={isMobile}
      campaignId={character.campaignId}
      busy={busy}
      error={error}
      onSave={handleSave}
    />
  );

  const feed = (
    <NoteFeed
      notes={notes}
      entities={byId}
      campaignId={character.campaignId}
      isMobile={isMobile}
      busy={busy}
      onEditSave={update}
      onDelete={remove}
    />
  );

  // Mobile: the shared slide-up sheet (grabber, safe-area padding, useDialogChrome).
  if (isMobile) {
    return (
      <BottomSheet title="Quick capture" onClose={onClose}>
        <div className="flex flex-col gap-1.5">{composer}</div>
        <div className="mt-4">{feed}</div>
      </BottomSheet>
    );
  }

  return <DesktopOverlay onClose={onClose} composer={composer} feed={feed} />;
}

// Initial-focus + desktop chrome effect. On mobile BottomSheet owns the chrome
// (scroll-lock/Escape/focus-trap); here we only place initial focus. At md+ the
// top overlay supplies its own Escape/scroll-lock/focus-restore.
function useCapturePaletteFocus(
  composerRef: React.RefObject<HTMLDivElement>,
  isMobile: boolean,
  onClose: () => void,
) {
  // Keep the latest onClose without re-running the mount effect on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Defer focus past first paint (double rAF) so the overlay lays out before the
    // keyboard animates, focus with preventScroll, then undo any residual reveal-
    // scroll — together these stop iOS offsetting the fixed sheet on open (#784).
    let raf1 = 0;
    let raf2 = 0;
    const deferredFocus = () => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          composerRef.current?.focus({ preventScroll: true });
          if (window.scrollY !== 0) window.scrollTo(0, 0);
        });
      });
    };
    const cancelFocus = () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };

    if (isMobile) {
      deferredFocus();
      return cancelFocus;
    }
    const previouslyFocused = document.activeElement as HTMLElement | null;
    deferredFocus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelFocus();
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [composerRef, isMobile]);
}

// Composer + Private opt-out. Owns the draft state; a successful save clears the
// text AND resets the toggle to shared, so privacy never leaks into the next note.
function NoteComposer({
  composerRef,
  isMobile,
  campaignId,
  busy,
  error,
  onSave,
}: {
  composerRef: React.RefObject<HTMLDivElement>;
  isMobile: boolean;
  campaignId?: string | null;
  busy: boolean;
  error: string | null;
  onSave: (body: string, visibility?: EntryVisibility) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  async function handleSave() {
    const body = value.trim();
    if (body === "" || busy) return;
    // Shared (the in-campaign default) omits visibility; only the opt-out is sent.
    const ok = await onSave(body, isPrivate ? "PRIVATE" : undefined);
    if (ok) {
      setValue("");
      setIsPrivate(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // Enter saves; Shift+Enter newlines; isComposing skips an IME-commit Enter.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSave();
    }
  }

  return (
    <>
      <MentionAutocomplete
        ref={composerRef}
        rows={isMobile ? 3 : 2}
        aria-label="Quick note"
        campaignId={campaignId}
        className={`${inputCls} resize-none`}
        placeholder="Jot a note… @ to tag"
        value={value}
        onChange={setValue}
        onKeyDown={handleKeyDown}
      />
      {campaignId && (
        <PrivateToggle checked={isPrivate} onChange={setIsPrivate} />
      )}
      {!isMobile && (
        <p className="text-xs text-parchment-500">Enter to save · Shift+Enter for a new line</p>
      )}
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
    </>
  );
}

// The visibility opt-out checkbox, shared by the composer and the inline editor.
function PrivateToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex w-fit items-center gap-1.5 text-xs text-parchment-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-garnet-600"
      />
      Private (only you can see this note)
    </label>
  );
}

// The NOTE list; owns which row is being edited or delete-confirmed.
function NoteFeed({
  notes,
  entities,
  campaignId,
  isMobile,
  busy,
  onEditSave,
  onDelete,
}: {
  notes: JournalEntry[];
  entities: Map<string, CampaignEntity>;
  campaignId?: string | null;
  isMobile: boolean;
  busy: boolean;
  onEditSave: (entryId: string, patch: NotePatch) => Promise<boolean>;
  onDelete: (entryId: string) => Promise<boolean>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  if (notes.length === 0) {
    return <p className="text-sm text-parchment-500">No notes captured yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-parchment-200">
      {notes.map((note) =>
        editingId === note.id ? (
          <NoteEditor
            key={note.id}
            note={note}
            isMobile={isMobile}
            busy={busy}
            campaignId={campaignId}
            onSave={async (patch) => {
              if (await onEditSave(note.id, patch)) setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <NoteRow
            key={note.id}
            note={note}
            entities={entities}
            campaignId={campaignId}
            busy={busy}
            confirmingDelete={confirmingDeleteId === note.id}
            onDelete={async () => {
              if (await onDelete(note.id)) setConfirmingDeleteId(null);
            }}
            onDeleteStart={() => {
              setEditingId(null);
              setConfirmingDeleteId(note.id);
            }}
            onDeleteCancel={() => setConfirmingDeleteId(null)}
            onEditStart={() => {
              setConfirmingDeleteId(null);
              setEditingId(note.id);
            }}
          />
        ),
      )}
    </ul>
  );
}

// Inline editor for one feed note; keyed by note id so it mounts fresh per edit.
// In a campaign the patch always carries an explicit visibility (mirrors
// JournalEntryPanel); campaign-less edits omit it (the server keeps PRIVATE).
function NoteEditor({
  note,
  isMobile,
  busy,
  campaignId,
  onSave,
  onCancel,
}: {
  note: JournalEntry;
  isMobile: boolean;
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
    <li className="flex flex-col gap-1 py-2">
      <textarea
        rows={isMobile ? 3 : 2}
        aria-label="Edit note"
        className={`${inputCls} resize-y`}
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
    </li>
  );
}

// One display row of the feed: body, private lock, timestamp, edit/delete actions.
function NoteRow({
  note,
  entities,
  campaignId,
  busy,
  confirmingDelete,
  onDelete,
  onDeleteStart,
  onDeleteCancel,
  onEditStart,
}: {
  note: JournalEntry;
  entities: Map<string, CampaignEntity>;
  campaignId?: string | null;
  busy: boolean;
  confirmingDelete: boolean;
  onDelete: () => void;
  onDeleteStart: () => void;
  onDeleteCancel: () => void;
  onEditStart: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <MentionText
        body={note.body}
        entities={entities}
        campaignId={campaignId}
        className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-parchment-800"
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
        {confirmingDelete ? (
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
        ) : (
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
        )}
      </div>
    </li>
  );
}

// md+: the top-anchored command-palette overlay with a light scrim.
function DesktopOverlay({
  onClose,
  composer,
  feed,
}: {
  onClose: () => void;
  composer: React.ReactNode;
  feed: React.ReactNode;
}) {
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
          {composer}
        </div>

        <div className="flex-1 overflow-y-auto p-4">{feed}</div>
      </div>
    </div>,
    document.body,
  );
}
