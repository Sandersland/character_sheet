// Fast in-session note capture over a per-session NOTE feed with inline edit/delete.
// Per-breakpoint presentation: a slide-up BottomSheet on mobile (#771; rewritten in
// #866), and a non-modal margin dock at md+ (#865). Both share the same NOTE feed,
// journal mutations, and the growing composer; only the shell + feed layout differ.

import { useEffect, useRef } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import CaptureDock from "@/features/journal/CaptureDock";
import GrowingComposer from "@/features/journal/GrowingComposer";
import { DockFeed, NoteFeed } from "@/features/journal/NoteFeed";
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

  const composer = (
    <GrowingComposer
      composerRef={composerRef}
      campaignId={character.campaignId}
      busy={busy}
      error={error}
      onSave={handleSave}
      showHints={!isMobile}
    />
  );

  // Mobile: the shared slide-up sheet (grabber, safe-area padding, useDialogChrome).
  if (isMobile) {
    return (
      <MobileCapture onClose={onClose} composerRef={composerRef}>
        <div className="flex flex-col gap-1.5">{composer}</div>
        <div className="mt-4">
          <NoteFeed
            notes={notes}
            entities={byId}
            campaignId={character.campaignId}
            busy={busy}
            onEditSave={update}
            onDelete={remove}
          />
        </div>
      </MobileCapture>
    );
  }

  return (
    <CaptureDock
      session={session}
      composerRef={composerRef}
      onClose={onClose}
      composer={composer}
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

// Mobile BottomSheet shell + deferred initial focus. The sheet owns the rest of its
// chrome (scroll-lock / Escape / focus-trap via useDialogChrome). Focus is deferred
// past first paint (double rAF) with preventScroll so iOS doesn't offset the fixed
// sheet as the keyboard animates in (#784).
function MobileCapture({
  onClose,
  composerRef,
  children,
}: {
  onClose: () => void;
  composerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        composerRef.current?.focus({ preventScroll: true });
        if (window.scrollY !== 0) window.scrollTo(0, 0);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [composerRef]);

  return (
    <BottomSheet title="Quick capture" onClose={onClose}>
      {children}
    </BottomSheet>
  );
}
