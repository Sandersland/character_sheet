import ActivityModal from "@/features/character-meta/ActivityModal";
import DeleteCharacterModal from "@/features/character-meta/DeleteCharacterModal";
import SessionsModal from "@/features/session/SessionsModal";
import CampaignSettingsSheet from "@/features/campaign/CampaignSettingsSheet";
import CapturePalette from "@/features/journal/CapturePalette";
import type { Character, Session } from "@/types/character";

interface CharacterSheetModalsProps {
  character: Character;
  onUpdate: (c: Character) => void;
  captureSessionId?: string;
  captureSession?: Session | null;
  deleteOpen: boolean;
  activityOpen: boolean;
  sessionsOpen: boolean;
  campaignSettingsOpen: boolean;
  captureOpen: boolean;
  onCloseDelete: () => void;
  onCloseActivity: () => void;
  onCloseSessions: () => void;
  onCloseCampaignSettings: () => void;
  onCloseCapture: () => void;
}

export default function CharacterSheetModals({
  character,
  onUpdate,
  captureSessionId,
  captureSession,
  deleteOpen,
  activityOpen,
  sessionsOpen,
  campaignSettingsOpen,
  captureOpen,
  onCloseDelete,
  onCloseActivity,
  onCloseSessions,
  onCloseCampaignSettings,
  onCloseCapture,
}: CharacterSheetModalsProps) {
  return (
    <>
      {deleteOpen && (
        <DeleteCharacterModal
          characterId={character.id}
          characterName={character.name}
          onClose={onCloseDelete}
        />
      )}

      {activityOpen && (
        <ActivityModal
          characterId={character.id}
          onClose={onCloseActivity}
          onUpdate={onUpdate}
        />
      )}

      {sessionsOpen && (
        <SessionsModal
          characterId={character.id}
          campaignId={character.campaignId}
          onClose={onCloseSessions}
        />
      )}

      {/* Guard on campaignId too: the sheet fetches the campaign, so it's
          meaningless for a campaign-less character (#1087). */}
      {campaignSettingsOpen && character.campaignId && (
        <CampaignSettingsSheet
          character={character}
          onUpdate={onUpdate}
          onClose={onCloseCampaignSettings}
        />
      )}

      {captureOpen && (
        <CapturePalette
          character={character}
          sessionId={captureSessionId}
          session={captureSession}
          onClose={onCloseCapture}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}
