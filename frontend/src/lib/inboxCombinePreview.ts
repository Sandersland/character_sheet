// What is lost by a combine lives in combinePreview.ts (losersOf, CombineDiscardedItem); this file reuses it rather than re-deriving it.

import { losersOf, type CombineDiscardedItem } from "@/lib/combinePreview";
import type { InboxDuplicateEntity } from "@/types/character";

interface MentionSummaryEntity {
  id: string;
  name: string;
  mentionCount: number;
}

// mentionCount is viewer-scoped, but a combine also rewrites @[id] tokens in players' PRIVATE journal notes the DM can't see, so the hedge clause is always appended (not gated on mentionsMoving > 0) and deliberately carries no number, which would leak how much a player has written privately.
export function combineSummaryLine(entities: MentionSummaryEntity[], survivorId: string): string {
  const survivor = entities.find((e) => e.id === survivorId);
  const losers = losersOf(entities, survivorId);
  const mentionsMoving = losers.reduce((sum, e) => sum + e.mentionCount, 0);
  const mentionWord = mentionsMoving === 1 ? "mention" : "mentions";
  const mentionVerb = mentionsMoving === 1 ? "moves" : "move";
  const rowWord = losers.length === 1 ? "row" : "rows";
  return `${mentionsMoving} ${mentionWord} ${mentionVerb} to ${survivor?.name ?? "?"}, plus any in players' private notes · ${losers.length} ${rowWord} deleted`;
}

// The inverse of combineDiscardedItems' "Hidden visibility" item: a REVEALED loser's mentions moving onto a HIDDEN survivor doesn't drop anything, but renders as a redacted "Hidden" chip until the survivor is revealed.
export function hiddenSurvivorRedactsRevealedMentions(
  entities: InboxDuplicateEntity[],
  survivorId: string,
): CombineDiscardedItem | null {
  const survivor = entities.find((e) => e.id === survivorId);
  if (survivor?.visibility !== "HIDDEN") return null;

  const revealedLosers = losersOf(entities, survivorId).filter((e) => e.visibility === "REVEALED");
  if (revealedLosers.length === 0) return null;

  return {
    key: "redacted-until-revealed",
    label: `Mentions from ${revealedLosers.map((e) => e.name).join(", ")} will render as "Hidden" until ${survivor.name} is revealed`,
  };
}
