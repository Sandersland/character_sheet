import type { CampaignArc, Character, ChronicleSession, EntryVisibility, JournalEntryKind } from "@/types/character";
import { jsonBody, request } from "@/api/http";

// Journal entries carry no mechanical effect, so they aren't routed through
// the audit log/transactions pattern — plain REST CRUD instead.

// kind defaults to ENTRY; NOTE omits date (server fills it with today).
export async function createJournalEntry(
  characterId: string,
  entry: {
    kind?: JournalEntryKind;
    date?: string;
    body: string;
    sessionId?: string;
    visibility?: EntryVisibility;
  }
): Promise<Character> {
  return request<Character>(
    `/characters/${characterId}/journal`,
    jsonBody(entry),
    "Failed to create journal entry",
  );
}

export async function updateJournalEntry(
  characterId: string,
  entryId: string,
  patch: { date?: string; body?: string; visibility?: EntryVisibility }
): Promise<Character> {
  return request<Character>(
    `/characters/${characterId}/journal/${entryId}`,
    jsonBody(patch, "PATCH"),
    "Failed to update journal entry",
  );
}

export async function deleteJournalEntry(
  characterId: string,
  entryId: string
): Promise<Character> {
  return request<Character>(
    `/characters/${characterId}/journal/${entryId}`,
    { method: "DELETE" },
    "Failed to delete journal entry",
  );
}

// Passing a characterId that isn't the caller's own 403s server-side.

/** Ordered by position asc (story order). */
export async function fetchCampaignArcs(campaignId: string): Promise<CampaignArc[]> {
  return request<CampaignArc[]>(
    `/campaigns/${campaignId}/arcs`,
    undefined,
    "Failed to fetch campaign arcs",
  );
}

/** Newest first. */
export async function fetchChronicleSessions(
  campaignId: string,
  characterId: string,
): Promise<ChronicleSession[]> {
  return request<ChronicleSession[]>(
    `/campaigns/${campaignId}/sessions?characterId=${encodeURIComponent(characterId)}`,
    undefined,
    "Failed to fetch chronicle sessions",
  );
}
