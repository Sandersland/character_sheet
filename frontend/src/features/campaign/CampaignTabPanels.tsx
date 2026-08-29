import CampaignDangerZone from "@/features/campaign/CampaignDangerZone";
import CampaignOverviewPanel from "@/features/campaign/CampaignOverviewPanel";
import CampaignCodex from "@/features/entities/CampaignCodex";
import CampaignItemsPanel from "@/features/entities/CampaignItemsPanel";
import CampaignManagePanel from "@/features/entities/CampaignManagePanel";
import type { Campaign } from "@/types/character";

interface CampaignTabPanelsProps {
  campaign: Campaign;
  active: "overview" | "codex" | "manage";
  onCampaignChange: (campaign: Campaign) => void;
}

export default function CampaignTabPanels({ campaign, active, onCampaignChange }: CampaignTabPanelsProps) {
  if (active === "manage") {
    return (
      <>
        <CampaignManagePanel campaignId={campaign.id} />
        {/* Campaign.rulesEdition is fine here — a DM surface picking an edition-invariant reference-cache slot, not sheet rules authority (#1437). */}
        <CampaignItemsPanel
          campaignId={campaign.id}
          characters={campaign.characters ?? []}
          edition={campaign.rulesEdition}
        />
        <CampaignDangerZone campaignId={campaign.id} campaignName={campaign.name} />
      </>
    );
  }
  if (active === "codex") {
    return (
      <CampaignCodex campaignId={campaign.id} role={campaign.role} campaignName={campaign.name} />
    );
  }
  return <CampaignOverviewPanel campaign={campaign} onCampaignChange={onCampaignChange} />;
}
