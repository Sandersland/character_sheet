import { useEffect, useState } from "react";

import { fetchCampaign } from "@/api/client";
import BottomSheet from "@/components/ui/BottomSheet";
import CampaignPreferencesFields from "@/features/campaign/CampaignPreferencesFields";
import type { Character } from "@/types/character";

interface CampaignSettingsSheetProps {
  character: Character;
  onUpdate: (c: Character) => void;
  onClose: () => void;
}

/**
 * Campaign-scoped play preferences, reached from the sheet header's ⋮ menu on
 * both breakpoints (#1087) — the toggles used to live on the Story tab but are
 * settings, not story. Header shows the campaign name + DM; body is the shared
 * CampaignPreferencesFields. The campaign line is best-effort: a failed fetch is
 * swallowed and the segment omitted (the toggles are the actual settings).
 */
export default function CampaignSettingsSheet({
  character,
  onUpdate,
  onClose,
}: CampaignSettingsSheetProps) {
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
        <p className="px-4 pb-2 text-sm text-parchment-700">
          <span className="font-semibold text-parchment-900">{campaignName}</span>
          {dmName && <span className="text-parchment-600"> · DM: {dmName}</span>}
        </p>
      )}
      {/* Fields carry their own row dividers; the border just groups them. */}
      <div className="overflow-hidden rounded-card border border-parchment-200 bg-parchment-50">
        <CampaignPreferencesFields character={character} onUpdate={onUpdate} />
      </div>
    </BottomSheet>
  );
}
