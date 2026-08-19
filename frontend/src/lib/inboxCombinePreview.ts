// Pure preview logic for the Review-duplicates modal (#1946): the N-way
// sibling of #1943's combinePreview.ts pair-combine preview. A cluster
// combines by absorbing every non-survivor entity into the chosen survivor —
// one #1942 call per loser — so every number here is computed over "the
// losers" rather than a single duplicate.

import type { CampaignEntity, CampaignEntityMerge, InboxDuplicateEntity } from "@/types/character";

export function losersOf<T extends { id: string }>(entities: T[], survivorId: string): T[] {
  return entities.filter((e) => e.id !== survivorId);
}

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

export interface InboxDiscardedItem {
  key: "visibility" | "notes" | "merge" | "redacted-until-revealed";
  label: string;
}

// The inverse of the "Hidden visibility" item below: a REVEALED loser's
// mentions moving onto a HIDDEN survivor doesn't drop anything, but it DOES
// change how those mentions render to players — as a redacted "Hidden" chip —
// until the survivor itself is revealed. Computable off the inbox row's own
// lightweight entities (visibility only), no full-entity fetch needed, so the
// caller can show this immediately rather than waiting on combineDiscardedItems'
// richer data.
export function hiddenSurvivorRedactsRevealedMentions(
  entities: InboxDuplicateEntity[],
  survivorId: string,
): InboxDiscardedItem | null {
  const survivor = entities.find((e) => e.id === survivorId);
  if (survivor?.visibility !== "HIDDEN") return null;

  const revealedLosers = entities.filter((e) => e.id !== survivorId && e.visibility === "REVEALED");
  if (revealedLosers.length === 0) return null;

  return {
    key: "redacted-until-revealed",
    label: `Mentions from ${revealedLosers.map((e) => e.name).join(", ")} will render as "Hidden" until ${survivor.name} is revealed`,
  };
}

// What's lost when every non-survivor entity in the cluster is combined away:
// only the categories some loser actually carries, each naming which losers —
// an empty list means the gold warning box in the modal doesn't render at all.
export function combineDiscardedItems(
  entities: CampaignEntity[],
  survivorId: string,
  merges: CampaignEntityMerge[],
): InboxDiscardedItem[] {
  const losers = losersOf(entities, survivorId);
  const items: InboxDiscardedItem[] = [];

  const hidden = losers.filter((e) => e.visibility === "HIDDEN");
  if (hidden.length > 0) {
    items.push({ key: "visibility", label: `Hidden visibility — ${hidden.map((e) => e.name).join(", ")}` });
  }

  const described = losers.filter((e) => e.stats?.hasDescription);
  if (described.length > 0) {
    items.push({ key: "notes", label: `Descriptions — ${described.map((e) => e.name).join(", ")}` });
  }

  const preparedMerge = losers.filter((loser) =>
    merges.some(
      (m) => m.status === "PREPARED" && (m.mergedEntityId === loser.id || m.survivorEntityId === loser.id),
    ),
  );
  if (preparedMerge.length > 0) {
    items.push({
      key: "merge",
      label: `Prepared identity merges — ${preparedMerge.map((e) => e.name).join(", ")}`,
    });
  }

  return items;
}
