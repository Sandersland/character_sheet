import type { CampaignArc, Character, ChronicleSession, EntryVisibility, JournalEntryKind } from "@/types/character";
import { jsonBody, request } from "@/api/http";

// Journal CRUD. Plain REST (no transaction/op batching) — journal entries carry no mechanical
// effect, so they aren't routed through the audit log. Each call returns the
// full updated Character so the caller can swap its state in one assignment.

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

// Journal chronicle (#863/#864). The read model behind the field-chronicle page:
// the campaign's arcs ("parts") and its sessions ("chapters") with derived
// sessionNumber + this character's per-session noteCount. A member sees every
// session of their campaign; passing a characterId that isn't the caller's own
// 403s server-side.

/** The campaign's arcs / "parts", ordered by position asc (story order). */
export async function fetchCampaignArcs(campaignId: string): Promise<CampaignArc[]> {
  return request<CampaignArc[]>(
    `/campaigns/${campaignId}/arcs`,
    undefined,
    "Failed to fetch campaign arcs",
  );
}

/** The chronicle session list (newest first) for a character — chapters + parts. */
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
