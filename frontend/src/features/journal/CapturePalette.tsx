import { useRef } from "react";

import CaptureDock from "@/features/journal/CaptureDock";
import GrowingComposer from "@/features/journal/GrowingComposer";
import MobileCaptureSheet from "@/features/journal/MobileCaptureSheet";
import { DockFeed, MobileFeed } from "@/features/journal/NoteFeed";
import { useJournalMutations } from "@/features/journal/useJournalMutations";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import type { EntryVisibility, Session } from "@/types/character";

interface CapturePaletteProps {
  sessionId?: string;
  session?: Session | null;
  onClose: () => void;
}

export default function CapturePalette({
  sessionId,
  session,
  onClose,
}: CapturePaletteProps) {
  const { character } = useCurrentCharacter();
  const composerRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsBelowMd();
  const { byId } = useCampaignEntities(character.campaignId);
  const { busy, error, create, update, remove } = useJournalMutations(character.id);

  const notes = character.journal
    .filter((e) => e.kind === "NOTE" && (!sessionId || e.sessionId === sessionId))
    .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());

  async function handleSave(body: string, visibility?: EntryVisibility): Promise<boolean> {
    return create({ kind: "NOTE", body, sessionId, ...(visibility ? { visibility } : {}) });
  }

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
      anchorKey={notes.length}
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
