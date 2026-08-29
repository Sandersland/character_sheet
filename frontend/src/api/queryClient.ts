import { QueryClient } from "@tanstack/react-query";

// Every transaction endpoint returns the full character (#1280), so a
// refetch inside staleTime can only race a correct value backwards.
// refetchOnWindowFocus is off: play happens in one tab, and a focus refetch
// could land mid-transaction. retry is off: client.ts throws bare Errors
// with no status, so a blind retry could re-send a 401 and fire the global
// session-expiry handler twice.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false },
    },
  });
}

// Tests swap the client per test (__setQueryClientForTests) so no cache
// bleeds across runs.
let client = createQueryClient();
export function getQueryClient(): QueryClient {
  return client;
}
export function __setQueryClientForTests(next: QueryClient): void {
  client = next;
}
