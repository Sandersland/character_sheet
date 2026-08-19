// Pure preview logic for the "Combine into…" confirm dialog (#1943), the
// entity-detail sibling of identity merges: absorbs a mistaken duplicate into
// its survivor rather than recording a secret "revealed to be" link. Every
// number here comes off the entity already on the wire — no new endpoint.

import { ENTITY_TYPE_LABELS } from "@/lib/mentions";
import type { CampaignEntity, CampaignEntityMerge } from "@/types/character";

export interface CombineDiscardedItem {
  key: string;
  label: string;
}

// What's lost when `duplicate` is combined into `survivor`: only the fields
// the duplicate actually carries — an empty list means the gold warning box
// in the dialog doesn't render at all.
export function combineDiscardedItems(
  duplicate: CampaignEntity,
  survivor: CampaignEntity,
): CombineDiscardedItem[] {
  const items: CombineDiscardedItem[] = [];
  if (duplicate.notes?.trim()) items.push({ key: "notes", label: "Description/notes" });
  if (duplicate.aliases.length > 0) {
    items.push({ key: "aliases", label: `Aliases — ${duplicate.aliases.join(", ")}` });
  }
  if (duplicate.portraitUrl) items.push({ key: "portrait", label: "Portrait" });
  if (duplicate.type !== survivor.type) {
    items.push({ key: "type", label: `Type — currently ${ENTITY_TYPE_LABELS[duplicate.type]}` });
  }
  if (duplicate.visibility === "HIDDEN") {
    items.push({ key: "visibility", label: "Hidden visibility" });
  }
  return items;
}

// "N mentions in M journal entries move to <Survivor>": JournalEntryRef is
// unique per (entry, entity) (see backend combineEntities/rewriteMentionTokens),
// so the mention count and the distinct-entry count are always the same number
// here — one stat, read twice.
export function combineMentionSummary(duplicate: CampaignEntity, survivorName: string): string {
  const count = duplicate.stats?.mentionCount ?? 0;
  const mentionWord = count === 1 ? "mention" : "mentions";
  const entryWord = count === 1 ? "entry" : "entries";
  return `${count} ${mentionWord} in ${count} journal ${entryWord} move to ${survivorName}`;
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

// A REVEALED duplicate's mentions move onto a HIDDEN survivor: those journal
// chips render as redacted "Hidden" text to players (routes/session/journal.ts
// visibility rendering) until the survivor itself is revealed — surprising
// since the mentions used to be readable. Both entities' `visibility` are
// plain wire fields, no extra fetch needed.
export function combineRedactedMentionWarning(
  duplicate: Pick<CampaignEntity, "visibility">,
  survivor: Pick<CampaignEntity, "visibility">,
): boolean {
  return duplicate.visibility === "REVEALED" && survivor.visibility === "HIDDEN";
}

// The duplicate's CampaignItemLink only moves onto an ITEM-typed survivor
// (assertItemLinkMovable, backend/src/lib/campaign/entities.ts) — anything
// else 409s, already surfaced by the generic error path. `duplicateFrontsItem`
// is the entity-detail page's own `detail.item !== null`
// (fetchCampaignItemByEntity), the one place that signal is already on the
// wire for the page being combined away.
//
// Gap: the SURVIVOR's own item-link status isn't observable from anything
// already fetched — the survivor picker's entity list carries no item-link
// field, and checking it would mean a new per-candidate request. So this can't
// distinguish "survivor is a bare ITEM entity" (the link transfers, this
// warning is right) from "survivor already fronts its own item" (the combine
// 409s instead — "Both entities are linked to an item" — rendered inline by
// the same error path as any other conflict).
export function combineItemLinkTransferWarning(
  duplicateType: CampaignEntity["type"],
  survivorType: CampaignEntity["type"],
  duplicateFrontsItem: boolean,
): boolean {
  return duplicateType === "ITEM" && duplicateFrontsItem && survivorType === "ITEM";
}
