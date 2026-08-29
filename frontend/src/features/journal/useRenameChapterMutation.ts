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

// Exact write, not invalidate: updateSessionTitle's response is a full Session, a different shape than the cached ChronicleSession[], so it can't be dropped in directly.
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
