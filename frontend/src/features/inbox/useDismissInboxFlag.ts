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
// confirm, not something the DM waits on. Rolls the optimistic removal back on
// failure and always refetches after, since the server is the source of truth
// for what's actually dismissed.
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
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(inboxKeys.all, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}
