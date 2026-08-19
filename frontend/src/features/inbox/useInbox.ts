import { useQuery } from "@tanstack/react-query";

import { fetchInbox } from "@/api/client";
import { inboxKeys } from "@/api/queryKeys";
import type { InboxRow } from "@/types/character";

// Frozen empty array, same reasoning as useCampaignEntities' NONE — an inbox
// with nothing dismissable renders the bell as absent, not as a loading blip.
const NONE: InboxRow[] = [];

// App-level inbox feed (#1945/#1946): recomputed server-side on every GET —
// a full duplicate-clustering scan across every campaign the caller owns, not
// a cheap row read — so this pins a longer staleTime than the global 30s
// default (@/api/queryClient) and stays off refetch-on-window-focus
// explicitly, rather than only relying on inheriting the global default.
export function useInbox() {
  const { data, isLoading } = useQuery({
    queryKey: inboxKeys.all,
    queryFn: fetchInbox,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return { rows: data ?? NONE, isLoading };
}
