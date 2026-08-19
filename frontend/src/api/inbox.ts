import type { DismissInboxFlagInput } from "@character-sheet/contracts";

import type { InboxRow } from "@/types/character";
import { jsonBody, request } from "@/api/http";

// App-level inbox (#1945): derived DM housekeeping flags across every
// campaign the caller owns. Consumed by AppHeader's bell (#1946).

export async function fetchInbox(): Promise<InboxRow[]> {
  return request<InboxRow[]>("/inbox", undefined, "Failed to fetch inbox");
}

export async function dismissInboxFlag(input: DismissInboxFlagInput): Promise<void> {
  await request<{ ok: true }>(
    "/inbox/dismissals",
    jsonBody(input),
    "Failed to dismiss inbox flag",
  );
}
