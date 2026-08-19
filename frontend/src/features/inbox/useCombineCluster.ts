import { useMutation, useQueryClient } from "@tanstack/react-query";

import { combineEntities } from "@/api/client";
import { campaignKeys, inboxKeys } from "@/api/queryKeys";
import { errorMessage } from "@/lib/errorMessage";
import type { CombineOutcome } from "@/lib/inboxCombineProgress";

interface CombineClusterInput {
  campaignId: string;
  loserIds: string[];
  survivorId: string;
}

// The Review-duplicates modal's commit (#1946): the #1942 endpoint combines
// exactly one pair, so an N-way cluster resolves as len(loserIds) sequential
// calls into the same survivor. Stops at the first failure (a 409 — ITEM-link,
// EXECUTED-reveal — or anything else) so a later loser's success can't paper
// over an earlier one that didn't land; everything before the failure already
// committed server-side and stays that way. The caller re-derives "what's left
// to retry" from the returned outcomes rather than this hook tracking it,
// since the modal also needs that same list to redraw its live summary.
export function useCombineCluster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, loserIds, survivorId }: CombineClusterInput) => {
      const outcomes: CombineOutcome[] = [];
      for (const entityId of loserIds) {
        try {
          await combineEntities(campaignId, entityId, survivorId);
          outcomes.push({ entityId, ok: true });
        } catch (err) {
          outcomes.push({ entityId, ok: false, error: errorMessage(err, "Failed to combine entities.") });
          return outcomes;
        }
      }
      return outcomes;
    },
    // Every landed combine is real backend state whether or not a later one in
    // the same batch failed, so refetch on both outcomes — never only onSuccess.
    onSettled: (_data, _error, { campaignId }) => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
      void queryClient.invalidateQueries({ queryKey: campaignKeys.entities(campaignId) });
      void queryClient.invalidateQueries({ queryKey: campaignKeys.entitiesWithStats(campaignId) });
      void queryClient.invalidateQueries({ queryKey: campaignKeys.merges(campaignId) });
    },
  });
}
