import JournalDoorway from "@/features/journal/JournalDoorway";
import IdentityCard from "@/features/character-meta/IdentityCard";
import CampaignPreferencesPanel from "@/features/campaign/CampaignPreferencesPanel";
import type { SheetPanelProps } from "@/features/character-meta/sheetTabs";

/**
 * Story tab — the low-frequency narrative surfaces: the journal doorway (opens
 * the field-chronicle page), a read-only identity summary (background/alignment,
 * #927), and, for campaign-attached characters, their campaign preferences.
 */
export default function StoryPanel({ character, onUpdate }: SheetPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <JournalDoorway character={character} />
      <IdentityCard character={character} />
      {/* Campaign-attached characters only (#537). */}
      {character.campaignId && (
        <CampaignPreferencesPanel character={character} onUpdate={onUpdate} />
      )}
    </div>
  );
}
