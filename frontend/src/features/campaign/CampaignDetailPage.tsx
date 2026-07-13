import { useEffect, useState } from "react";
import { Link, useMatch, useNavigate, useParams } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import CampaignTabPanels from "@/features/campaign/CampaignTabPanels";
import CampaignTabs from "@/features/campaign/CampaignTabs";
import { fetchCampaign } from "@/api/client";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import type { Campaign } from "@/types/character";

// The campaign hub: routed tabs — Overview (invite/add-character/roster) at
// /campaigns/:id, Codex (entity registry) at /campaigns/:id/codex, and an
// owner-only Manage tab (#379) at /campaigns/:id/manage.
export default function CampaignDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const onCodex = useMatch("/campaigns/:id/codex") !== null;
  const onManage = useMatch("/campaigns/:id/manage") !== null;
  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined);
  const { entities } = useCampaignEntities(id);
  const isOwner = campaign?.role === "OWNER";
  const activeTab = onManage && isOwner ? "manage" : onCodex ? "codex" : "overview";

  useEffect(() => {
    if (!id) return;
    let active = true;
    fetchCampaign(id)
      .then((c) => active && setCampaign(c))
      .catch(() => active && setCampaign(null));
    return () => {
      active = false;
    };
  }, [id]);

  // Guard the owner-only Manage route: a player deep-linking to /manage is
  // redirected back to Overview once we know their role.
  useEffect(() => {
    if (onManage && campaign && campaign.role !== "OWNER") {
      navigate(`/campaigns/${id}`, { replace: true });
    }
  }, [onManage, campaign, id, navigate]);

  if (campaign === undefined) return <Spinner variant="page" />;

  if (campaign === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-parchment-100 px-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-parchment-900">Campaign not found</h1>
        <p className="text-sm text-parchment-600">
          You may not be a member of this campaign, or it no longer exists.
        </p>
        <Link
          to="/campaigns"
          className="rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800"
        >
          Back to Campaigns
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parchment-100">
      <div className="border-b border-parchment-200 bg-parchment-50">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <Link to="/campaigns" className="text-xs font-semibold text-garnet-700 hover:underline">
            ← All campaigns
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl font-semibold text-parchment-900">
            {campaign.name}
            {campaign.role && (
              <Badge tone={campaign.role === "OWNER" ? "garnet" : "neutral"}>
                {campaign.role === "OWNER" ? "Owner" : "Player"}
              </Badge>
            )}
          </h1>
        </div>
      </div>

      {/* The codex tab is full-width (#840); the tab strip stays centered via its own wrapper. */}
      <main className={`mx-auto flex flex-col gap-6 px-6 py-8${onCodex ? "" : " max-w-4xl"}`}>
        <div className="mx-auto w-full max-w-4xl">
          <CampaignTabs
            campaignId={campaign.id}
            isOwner={isOwner}
            entityCount={entities.length}
            active={activeTab}
          />
        </div>
        <CampaignTabPanels campaign={campaign} active={activeTab} onCampaignChange={setCampaign} />
      </main>
    </div>
  );
}
