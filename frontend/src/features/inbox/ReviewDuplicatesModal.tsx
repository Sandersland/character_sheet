import { useState } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import DiscardedBox from "@/features/inbox/DiscardedBox";
import ReviewFooter from "@/features/inbox/ReviewFooter";
import SurvivorPicker from "@/features/inbox/SurvivorPicker";
import { useCombineCluster } from "@/features/inbox/useCombineCluster";
import { useReviewClusterEntities } from "@/features/inbox/useReviewClusterEntities";
import { deriveCombineProgress } from "@/lib/inboxCombineProgress";
import { combineDiscardedItems, combineSummaryLine, pendingRowsSummary } from "@/lib/inboxCombinePreview";
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
// summary + gold Discarded box computed once the full entity/merge data
// loads, then a sequential #1942 call per absorbed entity on commit.
// BottomSheet (not Modal) because it's already the responsive Modal/
// BottomSheet split this app uses everywhere else (centered dialog at md+,
// bottom sheet on mobile) — matching the spec's "Modal/BottomSheet-
// appropriate" instruction with one component instead of two.
export default function ReviewDuplicatesModal({
  row,
  onClose,
  onDisregard,
  disregarding,
}: ReviewDuplicatesModalProps) {
  const [survivorId, setSurvivorId] = useState(row.defaultSurvivorId);
  const { entities: fullEntities, merges, isLoading } = useReviewClusterEntities(row.campaignId);
  const combineMutation = useCombineCluster();

  const clusterIds = new Set(row.entities.map((e) => e.id));
  const clusterEntities = fullEntities.filter((e) => clusterIds.has(e.id));
  // Full data hasn't landed (or an entity was deleted out from under us
  // concurrently) — the picker list below still renders from the inbox row's
  // own summary shape, just the preview line/box wait for the richer fetch.
  const previewReady = !isLoading && clusterEntities.length === row.entities.length;

  const { remainingLoserIds, landedIds, failedEntity, failedError, survivorLocked } = deriveCombineProgress(
    row.entities,
    survivorId,
    combineMutation.data ?? [],
  );

  function handleCombine() {
    combineMutation.mutate(
      { campaignId: row.campaignId, loserIds: remainingLoserIds, survivorId },
      { onSuccess: (result) => result.every((o) => o.ok) && onClose() },
    );
  }

  const summaryLine = previewReady
    ? combineSummaryLine(clusterEntities, survivorId)
    : pendingRowsSummary(remainingLoserIds.length);

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
          locked={survivorLocked}
          landedIds={landedIds}
        />

        <p className="text-sm font-semibold text-parchment-800">{summaryLine}</p>

        {previewReady && <DiscardedBox items={combineDiscardedItems(clusterEntities, survivorId, merges)} />}

        {failedEntity && (
          <p className="text-xs font-semibold text-garnet-700">
            {failedEntity.name} failed to combine: {failedError}
          </p>
        )}

        <ReviewFooter
          onDisregard={() => onDisregard(row)}
          onCombine={handleCombine}
          disregarding={disregarding}
          combining={combineMutation.isPending}
          remainingCount={remainingLoserIds.length}
        />
      </div>
    </BottomSheet>
  );
}
