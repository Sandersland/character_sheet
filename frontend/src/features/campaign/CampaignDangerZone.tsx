import { useState } from "react";

import Card from "@/components/ui/Card";
import DeleteCampaignModal from "@/features/campaign/DeleteCampaignModal";

interface CampaignDangerZoneProps {
  campaignId: string;
  campaignName: string;
}

// Owner-only destructive actions, at the bottom of the Manage tab. Rendered only
// inside the owner-gated manage branch, so no role check of its own.
export default function CampaignDangerZone({ campaignId, campaignName }: CampaignDangerZoneProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <Card title="Danger zone" headingLevel={2} className="p-4">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <p className="min-w-0 flex-1 text-xs text-parchment-600">
          Deleting this campaign removes its sessions, codex, campaign items, and homebrew for
          every member. Characters are kept — they simply leave the campaign, along with their
          journals.
        </p>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-control bg-garnet-surface px-4 py-2 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-surface-hover"
        >
          Delete campaign
        </button>
      </div>
      {confirming && (
        <DeleteCampaignModal
          campaignId={campaignId}
          campaignName={campaignName}
          onClose={() => setConfirming(false)}
        />
      )}
    </Card>
  );
}
