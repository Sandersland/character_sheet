import CampaignPreferencesFields from "@/features/campaign/CampaignPreferencesFields";
import Card from "@/components/ui/Card";
import type { Character } from "@/types/character";

interface CampaignPreferencesPanelProps {
  character: Character;
  onUpdate: (c: Character) => void;
}

// Campaign-scoped play preferences (#537). Rendered only when the character is
// attached to a campaign (the caller gates on character.campaignId). Thin Card
// wrapper around the shared CampaignPreferencesFields toggles.
export default function CampaignPreferencesPanel({
  character,
  onUpdate,
}: CampaignPreferencesPanelProps) {
  return (
    <Card title="Campaign preferences" className="p-0">
      <CampaignPreferencesFields character={character} onUpdate={onUpdate} />
    </Card>
  );
}
