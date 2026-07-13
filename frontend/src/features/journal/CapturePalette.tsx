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
import type { CampaignEntity, Character, JournalEntry } from "@/types/character";

interface CapturePaletteProps {
  character: Character;
  /** Active session to scope the feed to; omitted shows all NOTE rows. */
  sessionId?: string;
  onClose: () => void;
  onUpdate: (character: Character) => void;
}

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
  const [value, setValue] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // The NOTE feed: newest-first, scoped to the active session when one is given.
  const notes = character.journal
    .filter((e) => e.kind === "NOTE" && (!sessionId || e.sessionId === sessionId))
    .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());

  // Keep the latest onClose without re-running the mount effect on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // On mobile BottomSheet owns the chrome (scroll-lock/Escape/focus-trap); here
  // we only place initial focus. At md+ the top overlay supplies its own chrome.
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
  }, [isMobile]);

  async function handleSave() {
    const body = value.trim();
    if (body === "" || busy) return;
    // Shared (the in-campaign default) omits visibility; only the opt-out is sent.
    const ok = await create({
      kind: "NOTE",
      body,
      sessionId,
      ...(isPrivate ? { visibility: "PRIVATE" as const } : {}),
    });
    if (ok) {
      setValue("");
      composerRef.current?.focus({ preventScroll: true });
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // Enter saves; Shift+Enter newlines; isComposing skips an IME-commit Enter.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSave();
    }
  }

  async function handleEditSave(entryId: string, body: string) {
    if (await update(entryId, { body })) setEditingId(null);
  }

  async function handleDelete(entryId: string) {
    if (await remove(entryId)) setConfirmingDeleteId(null);
  }

  const composer = (
    <>
      <MentionAutocomplete
        ref={composerRef}
        rows={isMobile ? 3 : 2}
        aria-label="Quick note"
        campaignId={character.campaignId}
        className={`${inputCls} resize-none`}
        placeholder="Jot a note… @ to tag"
        value={value}
        onChange={setValue}
        onKeyDown={handleComposerKeyDown}
      />
      {character.campaignId && (
        <label className="flex w-fit items-center gap-1.5 text-xs text-parchment-600">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="h-3.5 w-3.5 accent-garnet-600"
          />
          Private (only you can see this note)
        </label>
      )}
      {!isMobile && (
        <p className="text-xs text-parchment-500">Enter to save · Shift+Enter for a new line</p>
      )}
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
    </>
  );

  const feed =
    notes.length === 0 ? (
      <p className="text-sm text-parchment-500">No notes captured yet.</p>
    ) : (
      <ul className="flex flex-col divide-y divide-parchment-200">
        {notes.map((note) =>
          editingId === note.id ? (
            <NoteEditor
              key={note.id}
              note={note}
              isMobile={isMobile}
              busy={busy}
              onSave={(body) => handleEditSave(note.id, body)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <NoteRow
              key={note.id}
              note={note}
              entities={byId}
              campaignId={character.campaignId}
              busy={busy}
              confirmingDelete={confirmingDeleteId === note.id}
              onDelete={() => handleDelete(note.id)}
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

  // Mobile: the shared slide-up sheet (grabber, safe-area padding, useDialogChrome).
  if (isMobile) {
    return (
      <BottomSheet title="Quick capture" onClose={onClose}>
        <div className="flex flex-col gap-1.5">{composer}</div>
        <div className="mt-4">{feed}</div>
      </BottomSheet>
    );
  }

  // md+: the top-anchored command-palette overlay with a light scrim.
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

// Inline editor for one feed note; keyed by note id so it mounts fresh per edit.
function NoteEditor({
  note,
  isMobile,
  busy,
  onSave,
  onCancel,
}: {
  note: JournalEntry;
  isMobile: boolean;
  busy: boolean;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [editValue, setEditValue] = useState(note.body);

  function handleSave() {
    const body = editValue.trim();
    if (body === "") return;
    onSave(body);
  }

  return (
    <li className="py-2">
      <textarea
        rows={isMobile ? 3 : 2}
        aria-label="Edit note"
        className={`${inputCls} resize-y`}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
      />
      <div className="mt-1 flex gap-3 text-xs">
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
