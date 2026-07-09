import { useMemo } from "react";

import { useCampaignMerges } from "@/hooks/useCampaignMerges";
import { collectMergedInIdentities, resolveSurvivorChain } from "@/lib/merges";
import type { CampaignEntity } from "@/types/character";

// Identity-merge chains (#387): survivors this entity is revealed to be, and the
// former identities that merged into it. Both EXECUTED-only.
export function useEntityMerges(
  campaignId: string | undefined,
  entityId: string | undefined,
  byId: Map<string, CampaignEntity>,
) {
  const { merges } = useCampaignMerges(campaignId);

  const survivorChain = useMemo(
    () => (entityId ? resolveSurvivorChain(merges, entityId, { executedOnly: true }) : []),
    [merges, entityId],
  );
  const formerIdentityIds = useMemo(
    () => (entityId ? collectMergedInIdentities(merges, entityId, { executedOnly: true }) : []),
    [merges, entityId],
  );
  const nameFor = (id: string) => byId.get(id)?.name ?? "Unknown identity";

  return { survivorChain, formerIdentityIds, nameFor };
}
