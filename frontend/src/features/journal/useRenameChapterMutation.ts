import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateSessionTitle } from "@/api/client";
import { sessionKeys } from "@/api/queryKeys";
import type { ChronicleSession } from "@/types/character";

interface RenameChapterVars {
  campaignId: string;
  sessionId: string;
  title: string;
}

type ChronicleCache = { arcs: unknown; sessions: ChronicleSession[] } | undefined;

/**
 * JournalPage's chapter-rename write (#1299), split out so JournalPageBody's
 * own function stays under fallow's cognitive-complexity gate.
 *
 * Exact write, not invalidate: updateSessionTitle returns a full `Session`
 * (participants included), a different shape than the cached
 * `ChronicleSession[]` (which also carries derived sessionNumber/noteCount) —
 * so the response can't be dropped in directly. The title is already known
 * from the caller's own input, the same value the old setSessions splice used.
 */
export function useRenameChapterMutation(characterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, sessionId, title }: RenameChapterVars) =>
      updateSessionTitle(campaignId, sessionId, title),
    onSuccess: (_response, { campaignId, sessionId, title }) => {
      queryClient.setQueryData(
        sessionKeys.chronicle(campaignId, characterId),
        (prev: ChronicleCache) =>
          prev && {
            ...prev,
            sessions: prev.sessions.map((s) => (s.id === sessionId ? { ...s, title } : s)),
          },
      );
    },
  });
}
