import { useState } from "react";
import { Link } from "react-router-dom";

import { ArrowLeft } from "@/components/ui/icons";
import CapturePalette from "@/features/journal/CapturePalette";
import ChronicleSpine from "@/features/journal/ChronicleSpine";
import ManuscriptPage from "@/features/journal/ManuscriptPage";
import type { ChronicleChapter, ChronicleSpine as Spine } from "@/features/journal/chronicle";
import { useChronicleSelection } from "@/features/journal/useChronicleSelection";
import { useRenameChapterMutation } from "@/features/journal/useRenameChapterMutation";
import { LiveSessionProvider } from "@/features/session/LiveSessionProvider";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import { useCaptureDock } from "@/hooks/useCaptureDock";
import { CharacterRouteGate } from "@/hooks/CharacterRouteGate";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";

export default function JournalPage() {
  return (
    <CharacterRouteGate>
      <JournalPageBody />
    </CharacterRouteGate>
  );
}

function JournalPageBody() {
  const { character } = useCurrentCharacter();
  return (
    <LiveSessionProvider characterId={character.id}>
      <JournalChronicle />
    </LiveSessionProvider>
  );
}

function JournalChronicle() {
  const { character } = useCurrentCharacter();
  const isMobile = useIsBelowMd();
  const selection = useChronicleSelection(character);
  const { spine, error, effectiveId, setSelectedId, liveSessionId, selectedChapter, liveChapter } = selection;
  const [filter, setFilter] = useState("");

  const manuscript = selectedChapter ? (
    <JournalManuscript
      chapter={selectedChapter}
      liveChapter={liveChapter}
      onSwitchToLive={() => liveChapter && setSelectedId(liveChapter.id)}
    />
  ) : (
    <div className="rounded-card bg-parchment-50 p-12 text-center font-display text-parchment-500 shadow-card">
      Your chronicle is empty. Start a session or add a note to begin.
    </div>
  );

  const shared = {
    spine,
    effectiveId,
    filter,
    onFilterChange: setFilter,
    error,
    manuscript,
    captureSessionId: liveSessionId ?? selectedChapter?.sessionId ?? undefined,
  };

  return isMobile ? (
    <JournalMobileView {...shared} onSelect={setSelectedId} />
  ) : (
    <JournalDesktopView {...shared} onSelect={setSelectedId} />
  );
}

function JournalManuscript({
  chapter,
  liveChapter,
  onSwitchToLive,
}: {
  chapter: ChronicleChapter;
  liveChapter: ChronicleChapter | null;
  onSwitchToLive: () => void;
}) {
  const { character } = useCurrentCharacter();
  const { byId } = useCampaignEntities(character.campaignId);
  const renameMutation = useRenameChapterMutation(character.id);

  async function handleRename(title: string): Promise<boolean> {
    if (!character.campaignId || !chapter.sessionId) return false;
    try {
      await renameMutation.mutateAsync({ campaignId: character.campaignId, sessionId: chapter.sessionId, title });
      return true;
    } catch {
      return false;
    }
  }

  return (
    <ManuscriptPage
      chapter={chapter}
      entities={byId}
      canRename={chapter.sessionId != null && chapter.participantIds.includes(character.id)}
      onRename={handleRename}
      liveChapter={liveChapter}
      onSwitchToLive={onSwitchToLive}
    />
  );
}

interface JournalViewProps {
  spine: Spine;
  effectiveId: string | null;
  filter: string;
  onFilterChange: (value: string) => void;
  onSelect: (chapterId: string) => void;
  error: string | null;
  manuscript: React.ReactNode;
  /** The live session while the character is in one — quick capture is in-session capture — otherwise the selected chapter's. */
  captureSessionId?: string;
}

function BackLink() {
  const { character } = useCurrentCharacter();
  return (
    <Link
      to={`/characters/${character.id}`}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-garnet-700 hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {character.name}
    </Link>
  );
}

function JournalDesktopView(props: JournalViewProps) {
  const { spine, effectiveId, filter, onFilterChange, onSelect, error, manuscript } = props;
  // useCaptureDock (not a bare useState) so ⌘J/Ctrl+J toggles the dock here too,
  // matching the sheet and session surfaces.
  const { captureOpen, openCapture, closeCapture } = useCaptureDock();

  return (
    <div className="flex-1 bg-parchment-100">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <BackLink />
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
          sessionId={props.captureSessionId}
          onClose={closeCapture}
        />
      )}
    </div>
  );
}

function JournalMobileView(props: JournalViewProps) {
  const { spine, effectiveId, filter, onFilterChange, onSelect, error, manuscript } = props;
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
            className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-13 items-center gap-2 rounded-full bg-garnet-surface px-5 py-3 text-sm font-semibold text-garnet-on-surface shadow-raised"
          >
            ✎ Note
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <BackLink />
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
          sessionId={props.captureSessionId}
          onClose={() => setCaptureOpen(false)}
        />
      )}
    </div>
  );
}
