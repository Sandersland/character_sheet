// Pure preview logic for "what is lost by a combine" (#1943/#1946): the
// single source of truth both the entity-detail Combine dialog
// (CombineConfirmDialog, one duplicate) and the inbox's Review-duplicates
// modal (ReviewDuplicatesModal, an N-way cluster) render from. `losers` is
// every entity being absorbed into `survivor` and deleted — a pair-combine
// passes a 1-length array. Genuinely N-way-only preview pieces (the live
// summary line and its private-notes hedge, the redacted-mention warning)
// stay in inboxCombinePreview.ts — their wording and inputs differ enough
// from the single-duplicate dialog that folding them in here would just move
// the fork, not remove it.

import { ENTITY_TYPE_LABELS } from "@/lib/mentions";
import type { CampaignEntity, CampaignEntityMerge } from "@/types/character";

// Closed so a new category can't collide with an existing one under a typo'd
// string — these are React list keys drawn from more than one producer
// (combineDiscardedItems and preparedMergeDiscardedItem below,
// hiddenSurvivorRedactsRevealedMentions in inboxCombinePreview.ts) rendered
// into the same list by GoldWarningBox's DiscardedItemsBox.
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

// "solo": the surrounding dialog already names the one loser in its own
// heading (e.g. "Discarded with lili") — CombineConfirmDialog only, always
// called with a 1-length `losers`. "named": no such heading exists, so every
// label must name which losers it's about — ReviewDuplicatesModal, for ANY
// cluster size including a 2-entity cluster (1 loser). The caller passes
// this explicitly rather than it being inferred from `losers.length`: a
// 1-loser cluster combine still renders under a bare "Discarded" heading, so
// an unnamed label there would be just as ambiguous as a 3-loser one, and
// re-picking the survivor radio would silently change the unnamed label's
// referent with no visual change to the label itself.
export type DiscardLabelVoice = "solo" | "named";

// What's lost when every entity in `losers` is combined into `survivor`:
// only the categories some loser actually carries — an empty list means the
// gold warning box doesn't render at all.
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

  // Named mode can't just list loser names here (as visibility/portrait do)
  // — "Aliases — Lil, lili" reads as two alias VALUES in solo mode, so the
  // same shape naming two near-identical LOSERS would be genuinely
  // ambiguous. Naming each loser next to its own alias values disambiguates.
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

// "N mentions in M journal entries move to <Survivor>": JournalEntryRef is
// unique per (entry, entity) (see rewriteMentionTokens), so the mention count
// and the distinct-entry count are always the same number here — one stat,
// read twice. The trailing hedge is deliberate: rewriteMentionTokens touches
// EVERY journal entry regardless of author or visibility, including players'
// PRIVATE notes the DM can never read — so `count` (the viewer-scoped stat)
// undercounts what actually moves. Naming an exact private count would leak
// information the DM isn't supposed to have; the hedge says "some unknown
// amount more" instead of a number.
export function combineMentionSummary(duplicate: CampaignEntity, survivorName: string): string {
  const count = duplicate.stats?.mentionCount ?? 0;
  const mentionWord = count === 1 ? "mention" : "mentions";
  const entryWord = count === 1 ? "entry" : "entries";
  return `${count} ${mentionWord} in ${count} journal ${entryWord} move to ${survivorName}, plus any mentions in players' private notes`;
}

// The duplicate participates in a PREPARED identity merge on either side: as
// the old identity (mergedEntityId), that row cascade-deletes with it — the
// DM's secret prep silently vanishes; as the stand-in survivor
// (survivorEntityId), the backend repoints it onto the real survivor instead.
// Both are surprising enough to flag before an irreversible combine.
export function duplicateHasPreparedMerge(
  merges: CampaignEntityMerge[],
  duplicateId: string,
): boolean {
  return merges.some(
    (m) =>
      m.status === "PREPARED" && (m.mergedEntityId === duplicateId || m.survivorEntityId === duplicateId),
  );
}

// The discarded-item form of duplicateHasPreparedMerge above, folded into
// the same gold list combineDiscardedItems feeds — both CombineConfirmDialog
// and ReviewDuplicatesModal render one consequence-preview list, not a gold
// box plus a separately-styled warning for this one case.
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

// A REVEALED duplicate's mentions move onto a HIDDEN survivor: those journal
// chips render as redacted "Hidden" text to players (MentionText) until the
// survivor itself is revealed — surprising since the mentions used to be
// readable. Both entities' `visibility` are plain wire fields, no extra fetch
// needed.
export function combineRedactedMentionWarning(
  duplicate: Pick<CampaignEntity, "visibility">,
  survivor: Pick<CampaignEntity, "visibility">,
): boolean {
  return duplicate.visibility === "REVEALED" && survivor.visibility === "HIDDEN";
}

// The duplicate's CampaignItemLink only moves onto an ITEM-typed survivor that
// doesn't already front its own item (assertItemLinkMovable) — a survivor with
// its own link 409s instead ("Both entities are linked to an item"), already
// surfaced by the generic error path, so this only promises a transfer that
// will actually happen. `duplicateFrontsItem` is the entity-detail page's own
// `detail.item !== null` (fetchCampaignItemByEntity), the one place that
// signal is already on the wire for the page being combined away;
// `survivor.itemId` rides the entity list's own wire field (toWireEntity),
// so no extra fetch is needed for either side.
export function combineItemLinkTransferWarning(
  duplicateType: CampaignEntity["type"],
  survivor: Pick<CampaignEntity, "type" | "itemId">,
  duplicateFrontsItem: boolean,
): boolean {
  return duplicateType === "ITEM" && duplicateFrontsItem && survivor.type === "ITEM" && !survivor.itemId;
}
