// Preview logic specific to the Review-duplicates modal's N-way cluster
// combine (#1946) — the pieces that genuinely differ from #1943's
// single-duplicate dialog: the live summary line (fed the inbox row's own
// lightweight entities, not a full-entity fetch) and its private-notes
// hedge, the redacted-mention warning, and the prepared-merge item's
// labeling. "What is lost by a combine" itself — notes/aliases/portrait/
// type/visibility, generalized over a losers array — lives in
// combinePreview.ts; this file reuses it rather than re-deriving it.

import {
  duplicateHasPreparedMerge,
  losersOf,
  type CombineDiscardedItem,
} from "@/lib/combinePreview";
import type { CampaignEntityMerge, InboxDuplicateEntity } from "@/types/character";

interface MentionSummaryEntity {
  id: string;
  name: string;
  mentionCount: number;
}

// "1 mention moves to Lili, plus any in players' private notes · 2 rows
// deleted" — the live summary line. Typed over the minimal shape the inbox
// row's own InboxDuplicateEntity already carries (id/name/mentionCount), not
// the full CampaignEntity — the caller feeds row.entities directly so this
// renders on first paint, no fetch wait.
//
// mentionCount is viewer-scoped (journal-ref mentions the DM can see), but a
// combine rewrites @[id] tokens everywhere, including a player's PRIVATE
// journal notes the DM has no read access to. The hedge clause is always
// appended, not gated on mentionsMoving > 0 — a loser can carry private
// mentions the DM's own count says nothing about. Deliberately no number:
// showing an exact private-note count would leak how much a player has
// written privately, which is the one thing this hedge must not do.
export function combineSummaryLine(entities: MentionSummaryEntity[], survivorId: string): string {
  const survivor = entities.find((e) => e.id === survivorId);
  const losers = losersOf(entities, survivorId);
  const mentionsMoving = losers.reduce((sum, e) => sum + e.mentionCount, 0);
  const mentionWord = mentionsMoving === 1 ? "mention" : "mentions";
  const mentionVerb = mentionsMoving === 1 ? "moves" : "move";
  const rowWord = losers.length === 1 ? "row" : "rows";
  return `${mentionsMoving} ${mentionWord} ${mentionVerb} to ${survivor?.name ?? "?"}, plus any in players' private notes · ${losers.length} ${rowWord} deleted`;
}

// The inverse of combineDiscardedItems' "Hidden visibility" item: a REVEALED
// loser's mentions moving onto a HIDDEN survivor doesn't drop anything, but
// it DOES change how those mentions render to players — as a redacted
// "Hidden" chip — until the survivor itself is revealed. Computable off the
// inbox row's own lightweight entities (visibility only), no full-entity
// fetch needed, so the caller can show this immediately rather than waiting
// on combineDiscardedItems' richer data.
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

// A cluster's own "lost" category that combineDiscardedItems can't cover: it
// takes only `survivor: CampaignEntity`, but a PREPARED merge is a fact
// about a loser's participation in CampaignEntityMerge, not about the entity
// row itself. Reuses duplicateHasPreparedMerge per loser rather than
// re-deriving the PREPARED-status check inline.
export function preparedMergeDiscardedItem(
  losers: { id: string; name: string }[],
  merges: CampaignEntityMerge[],
): CombineDiscardedItem | null {
  const affected = losers.filter((loser) => duplicateHasPreparedMerge(merges, loser.id));
  if (affected.length === 0) return null;
  return {
    key: "merge",
    label: `Prepared identity merges — ${affected.map((e) => e.name).join(", ")}`,
  };
}
