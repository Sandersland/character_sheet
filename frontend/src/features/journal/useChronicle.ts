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
  //
  // staleTime:0 (overriding the global 30s), same rationale as SessionsModal:
  // nothing invalidates this key when a session ends (useCombatLifecycle only
  // touches the doorway/active-session keys), and JournalDoorway keeps this
  // query alive on the always-mounted sheet — so without staleTime:0, opening
  // the journal minutes after ending a session could still see this same key
  // as "fresh" and skip refetching, showing a chronicle missing the chapter
  // that just ended. A fresh mount (e.g. navigating to /journal) must always
  // confirm with the network.
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
