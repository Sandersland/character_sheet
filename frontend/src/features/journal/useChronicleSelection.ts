import { useMemo, useState } from "react";

import { buildChronicleSpine, defaultChapterId, findChapter } from "@/features/journal/chronicle";
import { useChronicle } from "@/features/journal/useChronicle";
import { useLiveSession } from "@/features/session/LiveSessionProvider";
import type { Character } from "@/types/character";

function deriveNoteCounts(journal: Character["journal"]) {
  const bySession = new Map<string, number>();
  let between = 0;
  for (const entry of journal) {
    if (entry.sessionId) bySession.set(entry.sessionId, (bySession.get(entry.sessionId) ?? 0) + 1);
    else between += 1;
  }
  return { bySession, between };
}

export function useChronicleSelection(character: Character) {
  const live = useLiveSession();
  const liveSessionId = live.status === "liveJoined" ? live.sessionId : null;
  const { arcs, sessions, error } = useChronicle(character, liveSessionId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useMemo(() => deriveNoteCounts(character.journal), [character.journal]);
  const spine = useMemo(
    () =>
      buildChronicleSpine({
        arcs,
        sessions,
        noteCountBySessionId: counts.bySession,
        betweenNoteCount: counts.between,
        hasSessionlessEntries: counts.between > 0,
        liveSessionId,
      }),
    [arcs, sessions, counts, liveSessionId],
  );

  // Derived (not stored) so the selection tracks the newest session as the
  // chronicle loads, instead of sticking on the between-sessions default from
  // the empty spine.
  const effectiveId = selectedId && findChapter(spine, selectedId) ? selectedId : defaultChapterId(spine);

  return {
    spine,
    error,
    effectiveId,
    setSelectedId,
    liveSessionId,
    selectedChapter: findChapter(spine, effectiveId),
    liveChapter: findChapter(spine, liveSessionId),
  };
}
