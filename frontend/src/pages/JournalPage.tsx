// Route: /characters/:id/journal — the field-chronicle page (#864). A chapter
// spine (sessions grouped by arcs into parts) on the left, a manuscript reading +
// writing page on the right. On mobile the spine collapses to a chapters list that
// pushes to the page, with a floating "✎ Note" quick-capture button. Design:
// option A "Quiet Manuscript" + frame A′ (desktop) / frame C (mobile).

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { updateSessionTitle } from "@/api/client";
import Spinner from "@/components/ui/Spinner";
import { ArrowLeft } from "@/components/ui/icons";
import CharacterLoadError from "@/features/character-meta/CharacterLoadError";
import CapturePalette from "@/features/journal/CapturePalette";
import ChronicleSpine from "@/features/journal/ChronicleSpine";
import ManuscriptPage from "@/features/journal/ManuscriptPage";
import {
  buildChronicleSpine,
  defaultChapterId,
  findChapter,
  type ChronicleSpine as Spine,
} from "@/features/journal/chronicle";
import { useChronicle } from "@/features/journal/useChronicle";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import { useCaptureDock } from "@/hooks/useCaptureDock";
import { useCharacter } from "@/hooks/useCharacter";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import type { Character } from "@/types/character";

export default function JournalPage() {
  const { id } = useParams();
  const { character, error, setCharacter } = useCharacter(id);
  const showSpinner = useDelayedFlag(character === undefined && !error);

  if (error) return <CharacterLoadError variant="error" />;
  if (character === undefined) return showSpinner ? <Spinner variant="page" /> : null;
  if (character === null) return <CharacterLoadError variant="not-found" characterId={id} />;

  return <JournalPageBody character={character} onUpdate={setCharacter} />;
}

// Per-chapter note counts from the live journal, so the spine stays current as
// notes are added/removed without refetching the chronicle.
function deriveNoteCounts(journal: Character["journal"]) {
  const bySession = new Map<string, number>();
  let between = 0;
  for (const entry of journal) {
    if (entry.sessionId) bySession.set(entry.sessionId, (bySession.get(entry.sessionId) ?? 0) + 1);
    else between += 1;
  }
  return { bySession, between };
}

function JournalPageBody({
  character,
  onUpdate,
}: {
  character: Character;
  onUpdate: (character: Character) => void;
}) {
  const isMobile = useIsBelowMd();
  const { arcs, sessions, error, setSessions } = useChronicle(character);
  const { byId } = useCampaignEntities(character.campaignId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const counts = useMemo(() => deriveNoteCounts(character.journal), [character.journal]);
  const spine = useMemo(
    () =>
      buildChronicleSpine({
        arcs,
        sessions,
        noteCountBySessionId: counts.bySession,
        betweenNoteCount: counts.between,
        hasSessionlessEntries: counts.between > 0,
      }),
    [arcs, sessions, counts],
  );

  // Honor an explicit selection while it stays valid; otherwise follow the default
  // (newest chapter). Deriving it — rather than storing the default in state — means
  // the selection tracks the newest session once the chronicle finishes loading,
  // instead of sticking on the between-sessions bucket picked from the empty spine.
  const effectiveId = selectedId && findChapter(spine, selectedId) ? selectedId : defaultChapterId(spine);
  const selectedChapter = findChapter(spine, effectiveId);

  async function handleRename(title: string): Promise<boolean> {
    if (!character.campaignId || !selectedChapter?.sessionId) return false;
    try {
      await updateSessionTitle(character.campaignId, selectedChapter.sessionId, title);
      setSessions((prev) => prev.map((s) => (s.id === selectedChapter.sessionId ? { ...s, title } : s)));
      return true;
    } catch {
      return false;
    }
  }

  const manuscript = selectedChapter ? (
    <ManuscriptPage
      character={character}
      chapter={selectedChapter}
      entities={byId}
      onUpdate={onUpdate}
      canRename={selectedChapter.sessionId != null && selectedChapter.participantIds.includes(character.id)}
      onRename={handleRename}
    />
  ) : (
    <div className="rounded-card bg-parchment-50 p-12 text-center font-display text-parchment-500 shadow-card">
      Your chronicle is empty. Start a session or add a note to begin.
    </div>
  );

  const shared = {
    character,
    onUpdate,
    spine,
    effectiveId,
    filter,
    onFilterChange: setFilter,
    error,
    manuscript,
    selectedSessionId: selectedChapter?.sessionId ?? undefined,
  };

  return isMobile ? (
    <JournalMobileView {...shared} onSelect={setSelectedId} />
  ) : (
    <JournalDesktopView {...shared} onSelect={setSelectedId} />
  );
}

interface JournalViewProps {
  character: Character;
  onUpdate: (character: Character) => void;
  spine: Spine;
  effectiveId: string | null;
  filter: string;
  onFilterChange: (value: string) => void;
  onSelect: (chapterId: string) => void;
  error: string | null;
  manuscript: React.ReactNode;
  selectedSessionId?: string;
}

function BackLink({ character }: { character: Character }) {
  return (
    <Link
      to={`/characters/${character.id}`}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-garnet-700 hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {character.name}
    </Link>
  );
}

// Desktop: fixed spine + manuscript, side by side.
function JournalDesktopView(props: JournalViewProps) {
  const { character, onUpdate, spine, effectiveId, filter, onFilterChange, onSelect, error, manuscript } = props;
  // useCaptureDock (not a bare useState) so ⌘J/Ctrl+J toggles the dock here too,
  // matching the sheet and session surfaces.
  const { captureOpen, openCapture, closeCapture } = useCaptureDock();

  return (
    <div className="flex-1 bg-parchment-100">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <BackLink character={character} />
          <button
            type="button"
            onClick={openCapture}
            className="rounded-control border border-parchment-200 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-600 hover:text-parchment-900"
          >
            Quick capture
          </button>
        </div>
        {error && <p className="mb-3 text-xs font-semibold text-garnet-700">{error}</p>}
        <div className="grid grid-cols-[288px_1fr] items-start gap-6">
          <ChronicleSpine
            spine={spine}
            selectedId={effectiveId}
            onSelect={onSelect}
            filter={filter}
            onFilterChange={onFilterChange}
          />
          {manuscript}
        </div>
      </div>
      {captureOpen && (
        <CapturePalette
          character={character}
          sessionId={props.selectedSessionId}
          onClose={closeCapture}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}

// Mobile: a chapters list that pushes to the manuscript page.
function JournalMobileView(props: JournalViewProps) {
  const { character, onUpdate, spine, effectiveId, filter, onFilterChange, onSelect, error, manuscript } = props;
  const [pageOpen, setPageOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

  function handleSelect(chapterId: string) {
    onSelect(chapterId);
    setPageOpen(true);
  }

  return (
    <div className="flex-1 bg-parchment-100 p-4 pb-[calc(4rem+env(safe-area-inset-bottom))]">
      {pageOpen ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setPageOpen(false)}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-garnet-700 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Chapters
          </button>
          {manuscript}
          <button
            type="button"
            onClick={() => setCaptureOpen(true)}
            className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-13 items-center gap-2 rounded-full bg-garnet-700 px-5 py-3 text-sm font-semibold text-parchment-50 shadow-raised"
          >
            ✎ Note
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <BackLink character={character} />
          </div>
          <h1 className="mb-3 font-display text-2xl font-semibold text-parchment-900">Chronicle</h1>
          {error && <p className="mb-3 text-xs font-semibold text-garnet-700">{error}</p>}
          <ChronicleSpine
            spine={spine}
            selectedId={effectiveId}
            onSelect={handleSelect}
            filter={filter}
            onFilterChange={onFilterChange}
          />
        </>
      )}
      {captureOpen && (
        <CapturePalette
          character={character}
          sessionId={props.selectedSessionId}
          onClose={() => setCaptureOpen(false)}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}
