import { useQuery } from "@tanstack/react-query";

import { fetchInbox } from "@/api/client";
import { inboxKeys } from "@/api/queryKeys";
import type { InboxRow } from "@/types/character";

// Frozen empty array, same reasoning as useCampaignEntities' NONE — an inbox
// with nothing dismissable renders the bell as absent, not as a loading blip.
const NONE: InboxRow[] = [];

// App-level inbox feed (#1945/#1946): recomputed server-side on every GET, so
// this is a plain query with no priming helper — nothing here is ever set
// optimistically except a dismissal (see useDismissInboxFlag).
export function useInbox() {
  const { data, isLoading } = useQuery({ queryKey: inboxKeys.all, queryFn: fetchInbox });
  return { rows: data ?? NONE, isLoading };
}
