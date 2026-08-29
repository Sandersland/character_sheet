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
  // Length-checks against row.entities, not just isLoading/isError, so an entity deleted out from under this fetch doesn't look like a complete preview.
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

  const summaryLine = useMemo(
    () => combineSummaryLine(row.entities, survivorId),
    [row.entities, survivorId],
  );

  const redactionWarning = useMemo(
    () => hiddenSurvivorRedactsRevealedMentions(row.entities, survivorId),
    [row.entities, survivorId],
  );
  // combineDiscardedItems and preparedMergeDiscardedItem are the one source of truth for what a combine discards (#1949).
  const clusterLosers = useMemo(() => losersOf(clusterEntities, survivorId), [clusterEntities, survivorId]);
  const survivorEntity = useMemo(
    () => clusterEntities.find((e) => e.id === survivorId),
    [clusterEntities, survivorId],
  );

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
          combineDisabled={isError}
          loserCount={loserIds.length}
        />
      </div>
    </BottomSheet>
  );
}
