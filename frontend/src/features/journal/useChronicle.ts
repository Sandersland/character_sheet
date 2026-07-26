// Loads the chronicle read model for the journal page (#864): the campaign's arcs
// ("parts") and its sessions ("chapters", with derived sessionNumber + this
// character's noteCount). A campaign-less character has neither, so the page falls
// back to a flat between-sessions chronicle. Per-chapter note counts are derived
// from the live character.journal in the page, not from the API's snapshot, so the
// spine stays current as notes are added/removed without a refetch.

import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchCampaignArcs, fetchChronicleSessions } from "@/api/client";
import { sessionKeys } from "@/api/queryKeys";
import type { Character } from "@/types/character";

export function useChronicle(character: Character | null | undefined) {
  const campaignId = character?.campaignId ?? null;
  const characterId = character?.id ?? null;

  // Arcs + sessions are always fetched together and treated as one read model
  // by every consumer — one query, not two independently-loading pieces.
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
  });

  return {
    arcs: data?.arcs ?? [],
    sessions: data?.sessions ?? [],
    loading: isLoading,
    error: isError ? "Failed to load the chronicle." : null,
  };
}
