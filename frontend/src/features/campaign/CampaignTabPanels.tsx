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

// The active tab's content: Manage (owner admin), Codex (entity ledger), or Overview.
export default function CampaignTabPanels({ campaign, active, onCampaignChange }: CampaignTabPanelsProps) {
  if (active === "manage") {
    return (
      <>
        <CampaignManagePanel campaignId={campaign.id} />
        {/* Campaign.rulesEdition is legitimate here and is NOT a rules-authority
            regression: this is a DM campaign surface, not a sheet, and the rarity
            tiers it selects are edition-invariant — the parameter only picks a
            /reference cache slot (#1437). A sheet still reads Character.rulesEdition. */}
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
