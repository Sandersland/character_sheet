import JournalDoorway from "@/features/journal/JournalDoorway";
import CampaignPreferencesPanel from "@/features/campaign/CampaignPreferencesPanel";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

/**
 * Story tab — the low-frequency narrative surfaces: the journal doorway (opens
 * the field-chronicle page) and, for campaign-attached characters, their campaign
 * preferences. Slice #922 relocates them unchanged.
 */
export default function StoryPanel({ character, onUpdate }: SheetPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <JournalDoorway character={character} />
      {/* Campaign-attached characters only (#537). */}
      {character.campaignId && (
        <CampaignPreferencesPanel character={character} onUpdate={onUpdate} />
      )}
    </div>
  );
}
