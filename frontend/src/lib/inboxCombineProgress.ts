// Derives the Review-duplicates modal's retry state (#1946) from the cluster's
// entities plus the last combine attempt's outcomes — pulled out of the modal
// component so the branchy "what's left, what failed, is the survivor locked"
// logic is one pure, directly-testable function instead of inline JSX-adjacent
// state.

import type { InboxDuplicateEntity } from "@/types/character";

export interface CombineOutcome {
  entityId: string;
  ok: boolean;
  error?: string;
}

export interface CombineProgress {
  remainingLoserIds: string[];
  landedIds: Set<string>;
  failedEntity: InboxDuplicateEntity | undefined;
  failedError: string | undefined;
  /** Once anything has landed, switching the survivor would strand an
   *  already-combined entity pointed at the wrong keeper. */
  survivorLocked: boolean;
}

export function deriveCombineProgress(
  entities: InboxDuplicateEntity[],
  survivorId: string,
  outcomes: CombineOutcome[],
): CombineProgress {
  const allLoserIds = entities.filter((e) => e.id !== survivorId).map((e) => e.id);
  const landedIds = new Set(outcomes.filter((o) => o.ok).map((o) => o.entityId));
  const failedOutcome = outcomes.find((o) => !o.ok);

  return {
    remainingLoserIds: allLoserIds.filter((id) => !landedIds.has(id)),
    landedIds,
    failedEntity: failedOutcome ? entities.find((e) => e.id === failedOutcome.entityId) : undefined,
    failedError: failedOutcome?.error,
    survivorLocked: landedIds.size > 0,
  };
}
