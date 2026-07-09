import Modal from "@/components/ui/Modal";
import CampaignRecapSection from "@/features/session/CampaignRecapSection";
import SessionAddXpForm from "@/features/session/SessionAddXpForm";
import SessionJournalList from "@/features/session/SessionJournalList";
import { useSessionRecapDetail } from "@/features/session/useSessionRecapDetail";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import type { Character, Session } from "@/types/character";

interface SessionSummaryModalProps {
  /** Owning character — needed to retroactively award XP to this session. */
  characterId: string;
  /** The ended session whose recap + participants are displayed. */
  session: Session;
  onClose: () => void;
  /**
   * Called with the updated character after a retroactive XP award lands, so the
   * parent sheet's XP can refresh live (otherwise it only updates on reload).
   */
  onCharacterUpdate?: (character: Character) => void;
}

// Read-only end-of-session recap (#245): the campaign aggregate, each
// participant's contribution, the session's journals, and a retroactive "add
// XP" affordance.
export default function SessionSummaryModal({
  characterId,
  session,
  onClose,
  onCharacterUpdate,
}: SessionSummaryModalProps) {
  const { recap, participants, journalEntries, applyRefreshed } = useSessionRecapDetail(
    characterId,
    session,
  );
  // Resolve @[<uuid>] tokens in note bodies to entity chips (plain text outside
  // a campaign or before the entities load).
  const { byId } = useCampaignEntities(session.campaignId);

  return (
    <Modal
      title={session.title ? `Session Recap — ${session.title}` : "Session Recap"}
      onClose={onClose}
    >
      <div className="flex flex-col gap-5">
        {!recap ? (
          <p className="py-6 text-center text-sm text-parchment-600">
            No summary is available for this session.
          </p>
        ) : (
          <CampaignRecapSection recap={recap} participants={participants} />
        )}

        <SessionJournalList
          entries={journalEntries}
          entities={byId}
          campaignId={session.campaignId}
        />

        {/* Retroactive awards only apply to a closed session — gate defensively. */}
        {session.status === "ended" && (
          <SessionAddXpForm
            characterId={characterId}
            sessionId={session.id}
            onAwarded={applyRefreshed}
            onCharacterUpdate={onCharacterUpdate}
          />
        )}
      </div>
    </Modal>
  );
}
