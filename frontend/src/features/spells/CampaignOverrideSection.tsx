// "Override for a campaign you run" — extracted out of ForkSpellSheet so its
// own loading/empty/list branching doesn't add to that component's
// complexity budget. Renders nothing at all once campaigns are loaded and
// the caller DMs none of them — a player forking a spell they don't run a
// table for sees only "Make my version".
import CampaignOverrideRow from "@/features/spells/CampaignOverrideRow";
import Spinner from "@/components/ui/Spinner";
import type { Campaign, CatalogSpell } from "@/types/character";

interface CampaignOverrideSectionProps {
  entryId: string | undefined;
  campaigns: Campaign[] | null;
  loadError: string | null;
  onForked: (result: { entryId: string; spell: CatalogSpell }) => void;
}

export default function CampaignOverrideSection({ entryId, campaigns, loadError, onForked }: CampaignOverrideSectionProps) {
  // Checked FIRST, ahead of the loading/error guards below: a spell with no
  // catalog metadata can never be forked regardless of how the campaign
  // fetch resolves, so there's nothing to show a spinner (or an error) FOR —
  // rendering either first would flash loading/error state for an outcome
  // that was always going to be "nothing here."
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
