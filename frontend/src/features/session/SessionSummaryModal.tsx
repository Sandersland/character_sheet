import Modal from "@/components/ui/Modal";
import CampaignRecapSection from "@/features/session/CampaignRecapSection";
import SessionAddXpForm from "@/features/session/SessionAddXpForm";
import SessionJournalList from "@/features/session/SessionJournalList";
import { useSessionRecapDetail } from "@/features/session/useSessionRecapDetail";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import type { Session } from "@/types/character";

interface SessionSummaryModalProps {
  /** Needed to retroactively award XP to this session, even though the modal is otherwise read-only. */
  characterId: string;
  session: Session;
  onClose: () => void;
}

export default function SessionSummaryModal({
  characterId,
  session,
  onClose,
}: SessionSummaryModalProps) {
  const { recap, participants, journalEntries, applyRefreshed } = useSessionRecapDetail(
    characterId,
    session,
  );
  // Falls back to plain text outside a campaign or before entities load.
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

        {session.status === "ended" && (
          <SessionAddXpForm
            characterId={characterId}
            sessionId={session.id}
            onAwarded={applyRefreshed}
          />
        )}
      </div>
    </Modal>
  );
}
