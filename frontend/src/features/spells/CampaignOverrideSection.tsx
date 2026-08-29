import CampaignOverrideRow from "@/features/spells/CampaignOverrideRow";
import Spinner from "@/components/ui/Spinner";
import type { Campaign } from "@/types/character";

interface CampaignOverrideSectionProps {
  entryId: string | undefined;
  campaigns: Campaign[] | null;
  loadError: string | null;
  onForked: () => void;
}

export default function CampaignOverrideSection({ entryId, campaigns, loadError, onForked }: CampaignOverrideSectionProps) {
  // Must run before the loading/error guards: an entryId-less spell can never be forked, so a loading/error state should never flash for it.
  if (!entryId) return null;
  if (loadError) return <p className="text-xs text-garnet-700">{loadError}</p>;
  if (campaigns === null) return <Spinner />;

  const dmCampaigns = campaigns.filter((c) => c.role === "OWNER");
  if (dmCampaigns.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-parchment-500">
        Override for a campaign you run
      </p>
      <ul className="flex flex-col gap-2">
        {dmCampaigns.map((campaign) => (
          <CampaignOverrideRow key={campaign.id} campaign={campaign} entryId={entryId} onForked={onForked} />
        ))}
      </ul>
    </div>
  );
}
