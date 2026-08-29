import { ENTITY_TYPE_LABELS } from "@/lib/mentions";
import type { CampaignEntity, CampaignEntityMerge } from "@/types/character";

// losers is every entity absorbed into survivor (a pair-combine passes a 1-length array); N-way-only pieces (live summary, redacted-mention warning) stay in inboxCombinePreview.ts, not here.

// Closed union so a typo'd string can't collide with an existing key — these are React list keys shared by combineDiscardedItems, preparedMergeDiscardedItem, and hiddenSurvivorRedactsRevealedMentions, rendered together by DiscardedItemsBox.
export type CombineDiscardedItemKey =
  | "notes"
  | "aliases"
  | "portrait"
  | "type"
  | "visibility"
  | "merge"
  | "redacted-until-revealed";

export interface CombineDiscardedItem {
  key: CombineDiscardedItemKey;
  label: string;
}

export function losersOf<T extends { id: string }>(entities: T[], survivorId: string): T[] {
  return entities.filter((e) => e.id !== survivorId);
}

// "solo" assumes the caller's own heading already names the 1 loser (CombineConfirmDialog only); "named" labels must name each loser themselves (ReviewDuplicatesModal, any cluster size) — passed explicitly rather than inferred from losers.length, since a re-picked survivor could silently change an unnamed label's referent.
export type DiscardLabelVoice = "solo" | "named";

// An empty result means the gold warning box doesn't render at all.
export function combineDiscardedItems(
  losers: CampaignEntity[],
  survivor: CampaignEntity,
  voice: DiscardLabelVoice,
): CombineDiscardedItem[] {
  const solo = voice === "solo";
  const items: CombineDiscardedItem[] = [];

  const described = losers.filter((e) => e.notes?.trim());
  if (described.length > 0) {
    items.push({
      key: "notes",
      label: solo ? "Description/notes" : `Descriptions — ${described.map((e) => e.name).join(", ")}`,
    });
  }

  // Named mode can't just list loser names here like visibility/portrait do — "Aliases — Lil, lili" reads as alias VALUES, so naming each loser next to its own alias values disambiguates.
  const aliased = losers.filter((e) => e.aliases.length > 0);
  if (aliased.length > 0) {
    items.push({
      key: "aliases",
      label: solo
        ? `Aliases — ${aliased[0]!.aliases.join(", ")}`
        : `Aliases — ${aliased.map((e) => `${e.name} (${e.aliases.join(", ")})`).join("; ")}`,
    });
  }

  const portrayed = losers.filter((e) => e.portraitUrl);
  if (portrayed.length > 0) {
    items.push({
      key: "portrait",
      label: solo ? "Portrait" : `Portraits — ${portrayed.map((e) => e.name).join(", ")}`,
    });
  }

  const retyped = losers.filter((e) => e.type !== survivor.type);
  if (retyped.length > 0) {
    items.push({
      key: "type",
      label: solo
        ? `Type — currently ${ENTITY_TYPE_LABELS[retyped[0]!.type]}`
        : `Type — ${retyped.map((e) => `${e.name} (${ENTITY_TYPE_LABELS[e.type]})`).join(", ")}`,
    });
  }

  const hidden = losers.filter((e) => e.visibility === "HIDDEN");
  if (hidden.length > 0) {
    items.push({
      key: "visibility",
      label: solo ? "Hidden visibility" : `Hidden visibility — ${hidden.map((e) => e.name).join(", ")}`,
    });
  }

  return items;
}

// count is read twice for both the mention and entry totals (JournalEntryRef is unique per entry+entity), but it undercounts since rewriteMentionTokens also touches players' PRIVATE notes — the trailing hedge avoids leaking an exact private count to the DM.
export function combineMentionSummary(duplicate: CampaignEntity, survivorName: string): string {
  const count = duplicate.stats?.mentionCount ?? 0;
  const mentionWord = count === 1 ? "mention" : "mentions";
  const entryWord = count === 1 ? "entry" : "entries";
  return `${count} ${mentionWord} in ${count} journal ${entryWord} move to ${survivorName}, plus any mentions in players' private notes`;
}

// The mergedEntityId side cascade-deletes silently (the DM's secret prep vanishes); the survivorEntityId side gets repointed onto the real survivor instead — both surprising enough to flag before an irreversible combine.
export function duplicateHasPreparedMerge(
  merges: CampaignEntityMerge[],
  duplicateId: string,
): boolean {
  return merges.some(
    (m) =>
      m.status === "PREPARED" && (m.mergedEntityId === duplicateId || m.survivorEntityId === duplicateId),
  );
}

// The discarded-item form of duplicateHasPreparedMerge, folded into the same gold list combineDiscardedItems feeds rather than a separately-styled warning.
export function preparedMergeDiscardedItem(
  losers: { id: string; name: string }[],
  merges: CampaignEntityMerge[],
  voice: DiscardLabelVoice,
): CombineDiscardedItem | null {
  const affected = losers.filter((loser) => duplicateHasPreparedMerge(merges, loser.id));
  if (affected.length === 0) return null;
  return {
    key: "merge",
    label:
      voice === "solo"
        ? "Prepared identity merge — combining drops it"
        : `Prepared identity merges — ${affected.map((e) => e.name).join(", ")}`,
  };
}

// A REVEALED duplicate's mentions moving onto a HIDDEN survivor render as redacted "Hidden" text to players (MentionText) until the survivor itself is revealed — surprising since they used to be readable.
export function combineRedactedMentionWarning(
  duplicate: Pick<CampaignEntity, "visibility">,
  survivor: Pick<CampaignEntity, "visibility">,
): boolean {
  return duplicate.visibility === "REVEALED" && survivor.visibility === "HIDDEN";
}

// Mirrors assertItemLinkMovable: a survivor already fronting its own item 409s instead, so this only promises a transfer that will actually happen; duplicateFrontsItem and survivor.itemId both ride existing wire fields, so no extra fetch is needed for either side.
export function combineItemLinkTransferWarning(
  duplicateType: CampaignEntity["type"],
  survivor: Pick<CampaignEntity, "type" | "itemId">,
  duplicateFrontsItem: boolean,
): boolean {
  return duplicateType === "ITEM" && duplicateFrontsItem && survivor.type === "ITEM" && !survivor.itemId;
}
