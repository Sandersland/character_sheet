import { useQuery } from "@tanstack/react-query";

import { fetchInbox } from "@/api/client";
import { inboxKeys } from "@/api/queryKeys";
import type { InboxRow } from "@/types/character";

// Frozen empty array so an inbox with nothing dismissable renders the bell as absent, not a loading blip — same reasoning as useCampaignEntities' NONE.
const NONE: InboxRow[] = [];

// GET /api/inbox is a full server-side clustering scan (not a cheap row read), so this pins a 60s staleTime above the global default and explicitly disables refetch-on-window-focus.
export function useInbox() {
  const { data, isLoading } = useQuery({
    queryKey: inboxKeys.all,
    queryFn: fetchInbox,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return { rows: data ?? NONE, isLoading };
}
