import { useEffect, useState } from "react";

import { fetchCampaign } from "@/api/client";
import BottomSheet from "@/components/ui/BottomSheet";
import CampaignPreferencesFields from "@/features/campaign/CampaignPreferencesFields";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

interface CampaignSettingsSheetProps {
  onClose: () => void;
}

export default function CampaignSettingsSheet({
  onClose,
}: CampaignSettingsSheetProps) {
  const { character } = useCurrentCharacter();
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [dmName, setDmName] = useState<string | null>(null);

  useEffect(() => {
    if (!character.campaignId) return;
    let cancelled = false;
    fetchCampaign(character.campaignId)
      .then((campaign) => {
        if (cancelled) return;
        setCampaignName(campaign.name);
        setDmName(campaign.members.find((m) => m.role === "OWNER")?.user.name ?? null);
      })
      .catch(() => {
        // Best-effort context line; the toggles below are the real settings.
      });
    return () => {
      cancelled = true;
    };
  }, [character.campaignId]);

  return (
    <BottomSheet title="Campaign settings" onClose={onClose}>
      {campaignName && (
        <p className="pb-2 text-sm text-parchment-700">
          <span className="font-semibold text-parchment-900">{campaignName}</span>
          {dmName && <span className="text-parchment-600"> · DM: {dmName}</span>}
        </p>
      )}
      {/* Fields carry their own row dividers; the border just groups them. */}
      <div className="overflow-hidden rounded-card border border-parchment-200 bg-parchment-50">
        <CampaignPreferencesFields />
      </div>
    </BottomSheet>
  );
}
