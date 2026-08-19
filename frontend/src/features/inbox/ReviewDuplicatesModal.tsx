import { useMemo, useState } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import { DiscardedItemsBox } from "@/components/ui/GoldWarningBox";
import ReviewFooter from "@/features/inbox/ReviewFooter";
import SurvivorPicker from "@/features/inbox/SurvivorPicker";
import { useCombineCluster } from "@/features/inbox/useCombineCluster";
import { useReviewClusterEntities } from "@/features/inbox/useReviewClusterEntities";
import {
  combineDiscardedItems,
  losersOf,
  preparedMergeDiscardedItem,
  type CombineDiscardedItem,
} from "@/lib/combinePreview";
import { errorMessage } from "@/lib/errorMessage";
import { combineSummaryLine, hiddenSurvivorRedactsRevealedMentions } from "@/lib/inboxCombinePreview";
import type { InboxDuplicateClusterRow } from "@/types/character";

interface ReviewDuplicatesModalProps {
  row: InboxDuplicateClusterRow;
  onClose: () => void;
  onDisregard: (row: InboxDuplicateClusterRow) => void;
  disregarding: boolean;
}

// The Review-duplicates modal (#1946) — the cluster sibling of #1943's
// CombineConfirmDialog, and this feature's only confirm surface (no second
// dialog): survivor radios default from the feed's defaultSurvivorId, a live
// summary line off the inbox row's own entities (no fetch wait — see
// combineSummaryLine), a gold Discarded box that fills in once the fuller
// entity/merge fetch lands, then ONE atomic #1942 call absorbing every loser
// at once. All-or-nothing server-side, so a rejection leaves every entity
// untouched — the radios stay live and the DM can just retry, no per-entity
// landed/locked state to track. BottomSheet (not Modal) because it's already
// the responsive Modal/BottomSheet split this app uses everywhere else
// (centered dialog at md+, bottom sheet on mobile) — matching the spec's
// "Modal/BottomSheet-appropriate" instruction with one component instead of
// two.
export default function ReviewDuplicatesModal({
  row,
  onClose,
  onDisregard,
  disregarding,
}: ReviewDuplicatesModalProps) {
  const [survivorId, setSurvivorId] = useState(row.defaultSurvivorId);
  const { entities: fullEntities, merges, isLoading, isError } = useReviewClusterEntities(row.campaignId);
  const combineMutation = useCombineCluster();

  const clusterEntities = useMemo(() => {
    const clusterIds = new Set(row.entities.map((e) => e.id));
    return fullEntities.filter((e) => clusterIds.has(e.id));
  }, [row.entities, fullEntities]);
  // Full data hasn't landed (still loading, merges still pending, an entity
  // was deleted out from under us concurrently, or the merges fetch failed)
  // — the picker list and summary line below still render from the inbox
  // row's own summary shape; only the Discarded box's fuller categories
  // (dropped descriptions, prepared merges) wait on this. isLoading already
  // folds in the merges query (see useReviewClusterEntities); isError keeps
  // a failed merges fetch from looking like a complete, merge-free preview.
  const previewReady = !isLoading && !isError && clusterEntities.length === row.entities.length;

  const loserIds = useMemo(
    () => losersOf(row.entities, survivorId).map((e) => e.id),
    [row.entities, survivorId],
  );

  function handleCombine() {
    combineMutation.mutate(
      { campaignId: row.campaignId, loserIds, survivorId },
      { onSuccess: onClose },
    );
  }

  // Typed over {id, name, mentionCount} — row.entities already carries that,
  // so this renders on first paint rather than waiting on clusterEntities.
  const summaryLine = useMemo(
    () => combineSummaryLine(row.entities, survivorId),
    [row.entities, survivorId],
  );

  // Only needs visibility, already on the inbox row's own lightweight
  // entities — shows immediately, no fetch wait.
  const redactionWarning = useMemo(
    () => hiddenSurvivorRedactsRevealedMentions(row.entities, survivorId),
    [row.entities, survivorId],
  );
  // The full-entity/merge fetch's own losers/survivor, shared by
  // combineDiscardedItems and preparedMergeDiscardedItem — both from
  // combinePreview.ts, the one source of truth for "what is lost by a
  // combine" (#1949).
  const clusterLosers = useMemo(() => losersOf(clusterEntities, survivorId), [clusterEntities, survivorId]);
  const survivorEntity = useMemo(
    () => clusterEntities.find((e) => e.id === survivorId),
    [clusterEntities, survivorId],
  );

  // "named": this modal has no per-entity heading (bare "Discarded", not
  // "Discarded with X") for any cluster size, including a 2-entity cluster
  // (1 loser) — so every label must name which loser it's about.
  const discardedItems = useMemo((): CombineDiscardedItem[] => {
    if (!previewReady || !survivorEntity) {
      return redactionWarning ? [redactionWarning] : [];
    }
    const mergeItem = preparedMergeDiscardedItem(clusterLosers, merges, "named");
    return [
      ...(redactionWarning ? [redactionWarning] : []),
      ...combineDiscardedItems(clusterLosers, survivorEntity, "named"),
      ...(mergeItem ? [mergeItem] : []),
    ];
  }, [redactionWarning, previewReady, survivorEntity, clusterLosers, merges]);

  return (
    <BottomSheet title="Review duplicates" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-parchment-700">
          Choose the entry to keep. The others are combined into it and deleted — their journal
          mentions move to the kept entry.
        </p>

        <SurvivorPicker
          entities={row.entities}
          groupName={`inbox-survivor-${row.signature}`}
          survivorId={survivorId}
          onSelect={setSurvivorId}
        />

        <p className="text-sm font-semibold text-parchment-800">{summaryLine}</p>

        <DiscardedItemsBox heading="Discarded" items={discardedItems} />

        {isError && (
          <p className="text-xs font-semibold text-garnet-700">
            Couldn't load the full preview, so the Discarded warnings may be incomplete. Close and
            reopen to retry — combining is disabled until the preview loads.
          </p>
        )}

        {combineMutation.isError && (
          <p className="text-xs font-semibold text-garnet-700">
            {errorMessage(combineMutation.error, "Failed to combine entities.")}
          </p>
        )}

        <ReviewFooter
          onDisregard={() => onDisregard(row)}
          onCombine={handleCombine}
          disregarding={disregarding}
          combining={combineMutation.isPending}
          // The gate can't stand behind warnings it failed to load — a broken
          // preview blocks the no-undo commit, not just decorates it.
          combineDisabled={isError}
          loserCount={loserIds.length}
        />
      </div>
    </BottomSheet>
  );
}
