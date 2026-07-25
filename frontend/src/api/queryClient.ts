import { QueryClient } from "@tanstack/react-query";

// Defaults tuned for a cache that mutations write EXACTLY — every transaction
// endpoint returns the full character (#1280), so freshness costs more than it
// buys. staleTime 30s: a refetch inside that window can only race a correct value
// backwards. refetchOnWindowFocus off: play happens in one tab and a focus
// refetch would land mid-transaction. retry off: client.ts throws bare Errors
// with no status, so a blind retry would re-send a 401 and fire the global
// session-expiry handler twice.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false },
    },
  });
}

// One module-level client so the cache can be written from outside React:
// primeCampaignEntities/primeCampaignMerges are module functions called from six
// components this step must not touch. Retired by #1283. Tests swap it per test
// so no cache bleeds across (#282).
let client = createQueryClient();
export function getQueryClient(): QueryClient {
  return client;
}
export function __setQueryClientForTests(next: QueryClient): void {
  client = next;
}
