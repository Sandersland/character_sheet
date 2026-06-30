import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import type { Character } from "@/types/character";

// Sheet-header campaign affordance. The actual attach action lives on the
// campaign management screen — here we only link there: a badge to the
// character's campaign when set, otherwise a prompt to the Campaigns hub.
export default function CampaignIndicator({ character }: { character: Character }) {
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
