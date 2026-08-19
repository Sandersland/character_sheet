import type { InboxFlagKind, InboxRow } from "@/types/character";
import { jsonBody, request } from "@/api/http";

// App-level inbox (#1945): derived DM housekeeping flags across every
// campaign the caller owns. Not yet wired into the UI — the bell in
// AppHeader lands with the inbox frontend slice this backend slice blocks.

// fallow-ignore-next-line unused-export -- wired up by the inbox frontend slice, not this backend-scoped issue
export async function fetchInbox(): Promise<InboxRow[]> {
  return request<InboxRow[]>("/inbox", undefined, "Failed to fetch inbox");
}

// fallow-ignore-next-line unused-export -- wired up by the inbox frontend slice, not this backend-scoped issue
export async function dismissInboxFlag(input: {
  campaignId: string;
  kind: InboxFlagKind;
  signature: string;
}): Promise<void> {
  await request<{ ok: true }>(
    "/inbox/dismissals",
    jsonBody(input),
    "Failed to dismiss inbox flag",
  );
}
