// Per-chapter note counts are derived from the live character.journal, not from this query's session snapshot, so the spine stays current without a refetch.
import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchCampaignArcs, fetchChronicleSessions } from "@/api/client";
import { sessionKeys } from "@/api/queryKeys";
import type { Character } from "@/types/character";

export function useChronicle(character: Character | null | undefined) {
  const campaignId = character?.campaignId ?? null;
  const characterId = character?.id ?? null;

  // staleTime:0 — nothing invalidates this key when a session ends, so without it a fresh mount could show a chronicle missing the just-ended session.
  const { data, isLoading, isError } = useQuery({
    queryKey: sessionKeys.chronicle(campaignId, characterId),
    queryFn:
      campaignId && characterId
        ? async () => {
            const [arcs, sessions] = await Promise.all([
              fetchCampaignArcs(campaignId),
              fetchChronicleSessions(campaignId, characterId),
            ]);
            return { arcs, sessions };
          }
        : skipToken,
    staleTime: 0,
  });

  return {
    arcs: data?.arcs ?? [],
    sessions: data?.sessions ?? [],
    loading: isLoading,
    error: isError ? "Failed to load the chronicle." : null,
  };
}
