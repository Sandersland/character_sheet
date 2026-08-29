import type { DismissInboxFlagInput } from "@character-sheet/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dismissInboxFlag } from "@/api/client";
import { inboxKeys } from "@/api/queryKeys";
import type { InboxRow } from "@/types/character";

// onSuccess invalidates with refetchType: "none" (the optimistic removal is already exact); onError invalidates with the default refetchType because the rollback itself may already be stale.
export function useDismissInboxFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DismissInboxFlagInput) => dismissInboxFlag(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: inboxKeys.all });
      const previous = queryClient.getQueryData<InboxRow[]>(inboxKeys.all);
      queryClient.setQueryData<InboxRow[]>(inboxKeys.all, (rows) =>
        (rows ?? []).filter((r) => !(r.kind === input.kind && r.signature === input.signature)),
      );
      return { previous };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all, refetchType: "none" });
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(inboxKeys.all, context.previous);
      // No context means onMutate itself threw before touching the cache, so there's nothing to reconcile — skip the refetch.
      if (context) void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}
