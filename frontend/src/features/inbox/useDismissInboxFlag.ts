import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dismissInboxFlag } from "@/api/client";
import { inboxKeys } from "@/api/queryKeys";
import type { InboxFlagKind, InboxRow } from "@/types/character";

interface DismissInput {
  campaignId: string;
  kind: InboxFlagKind;
  signature: string;
}

// "Disregard" (row or Review-modal footer, #1946): posts a dismissal (#1945)
// and removes the row from the inbox list immediately — the POST is fire-and-
// confirm, not something the DM waits on. On success the optimistic removal
// is already exactly what the server now reflects, so it's marked stale
// (refetchType "none") rather than eagerly re-fetched — a full clustering
// scan the DM's own click didn't ask to pay for. On failure, roll the
// optimistic removal back AND actually refetch (default refetchType) to
// reconcile with the server, since the rollback itself might already be
// stale by the time the request failed. The caller (InboxBell) is
// responsible for surfacing `error` — this hook only manages the cache.
export function useDismissInboxFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DismissInput) => dismissInboxFlag(input),
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
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}
