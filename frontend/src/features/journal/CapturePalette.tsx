// Fast in-session note capture over a per-session NOTE feed with inline edit/delete.
// Per-breakpoint presentation: a full-height, keyboard-pinned chat-style surface on
// mobile (#866), and a non-modal margin dock at md+ (#865). Both share the same NOTE
// feed, journal mutations, and the growing composer; only the shell + feed layout
// (and the composer's lock/send arrangement) differ.

import { useRef } from "react";

import CaptureDock from "@/features/journal/CaptureDock";
import GrowingComposer from "@/features/journal/GrowingComposer";
import MobileCaptureSheet from "@/features/journal/MobileCaptureSheet";
import { DockFeed, MobileFeed } from "@/features/journal/NoteFeed";
import { useJournalMutations } from "@/features/journal/useJournalMutations";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import type { Character, EntryVisibility, Session } from "@/types/character";

interface CapturePaletteProps {
  character: Character;
  /** Active session to scope the feed to; omitted shows all NOTE rows. */
  sessionId?: string;
  /** Live session, when known: the dock header shows its title + elapsed time. */
  session?: Session | null;
  onClose: () => void;
  onUpdate: (character: Character) => void;
}

export default function CapturePalette({
  character,
  sessionId,
  session,
  onClose,
  onUpdate,
}: CapturePaletteProps) {
  const composerRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsBelowMd();
  const { byId } = useCampaignEntities(character.campaignId);
  const { busy, error, create, update, remove } = useJournalMutations(character.id, onUpdate);

  // The NOTE feed: newest-first, scoped to the active session when one is given.
  const notes = character.journal
    .filter((e) => e.kind === "NOTE" && (!sessionId || e.sessionId === sessionId))
    .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());

  async function handleSave(body: string, visibility?: EntryVisibility): Promise<boolean> {
    return create({ kind: "NOTE", body, sessionId, ...(visibility ? { visibility } : {}) });
  }

  // Mobile: the full-height keyboard-pinned chat surface (#866) with the mobile
  // composer variant (lock icon-button · field · circular send).
  if (isMobile) {
    return (
      <MobileCaptureSheet
        session={session}
        composerRef={composerRef}
        onClose={onClose}
        anchorKey={notes.length}
        feed={
          <MobileFeed
            notes={notes}
            entities={byId}
            campaignId={character.campaignId}
            busy={busy}
            onEditSave={update}
            onDelete={remove}
          />
        }
        composer={
          <GrowingComposer
            composerRef={composerRef}
            campaignId={character.campaignId}
            busy={busy}
            error={error}
            onSave={handleSave}
            variant="mobile"
          />
        }
      />
    );
  }

  return (
    <CaptureDock
      session={session}
      composerRef={composerRef}
      onClose={onClose}
      composer={
        <GrowingComposer
          composerRef={composerRef}
          campaignId={character.campaignId}
          busy={busy}
          error={error}
          onSave={handleSave}
          showHints
        />
      }
      feed={
        <DockFeed
          notes={notes}
          entities={byId}
          campaignId={character.campaignId}
          busy={busy}
          onEditSave={update}
          onDelete={remove}
        />
      }
    />
  );
}
