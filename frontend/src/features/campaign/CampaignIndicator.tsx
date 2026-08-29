import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

export default function CampaignIndicator() {
  const { character } = useCurrentCharacter();
  if (character.campaignId) {
    return (
      <Link to={`/campaigns/${character.campaignId}`} className="inline-flex">
        <Badge tone="arcane">In a campaign</Badge>
      </Link>
    );
  }

  return (
    <Link to="/campaigns" className="text-xs font-semibold text-arcane-700 hover:underline">
      Add via Campaigns
    </Link>
  );
}
