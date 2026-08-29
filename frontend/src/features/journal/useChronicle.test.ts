import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { fetchCampaignArcs, fetchChronicleSessions } from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { sessionKeys } from "@/api/queryKeys";
import { useChronicle } from "@/features/journal/useChronicle";
import type { Character, ChronicleSession } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCampaignArcs: vi.fn(),
  fetchChronicleSessions: vi.fn(),
}));

const mockArcs = vi.mocked(fetchCampaignArcs);
const mockSessions = vi.mocked(fetchChronicleSessions);

function makeCharacter(over: Partial<Character> = {}): Character {
  return { id: "char-1", campaignId: "camp-1", journal: [], ...over } as unknown as Character;
}

function session(over: Partial<ChronicleSession> & { id: string; sessionNumber: number }): ChronicleSession {
  return {
    campaignId: "camp-1",
    status: "ended",
    startedAt: "2026-07-01T00:00:00.000Z",
    title: null,
    noteCount: 0,
    ...over,
  };
}

// Opening the journal within the global 30s staleTime must still refetch, since JournalDoorway may have already cached this key without the just-ended session (#1299).
describe("useChronicle refetch-on-mount (#1299 re-review)", () => {
  beforeEach(() => {
    mockArcs.mockReset();
    mockSessions.mockReset();
  });

  it("refetches on a fresh mount even though the cache already holds fresh-looking data, picking up a just-ended session", async () => {
    const character = makeCharacter();

    getQueryClient().setQueryData(sessionKeys.chronicle("camp-1", "char-1"), {
      arcs: [],
      sessions: [session({ id: "s1", sessionNumber: 1, title: "Old Chapter" })],
    });

    mockArcs.mockResolvedValue([]);
    mockSessions.mockResolvedValue([
      session({ id: "s1", sessionNumber: 1, title: "Old Chapter" }),
      session({ id: "s2", sessionNumber: 2, title: "The One That Just Ended" }),
    ]);

    renderHook(() => useChronicle(character));

    await waitFor(() => expect(mockSessions).toHaveBeenCalledWith("camp-1", "char-1"));
    await waitFor(() => {
      const cached = getQueryClient().getQueryData<{ sessions: ChronicleSession[] }>(
        sessionKeys.chronicle("camp-1", "char-1"),
      );
      expect(cached?.sessions.map((s) => s.id)).toContain("s2");
    });
  });
});
