import { useMemo, useState } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import DiscardedBox from "@/features/inbox/DiscardedBox";
import ReviewFooter from "@/features/inbox/ReviewFooter";
import SurvivorPicker from "@/features/inbox/SurvivorPicker";
import { useCombineCluster } from "@/features/inbox/useCombineCluster";
import { useReviewClusterEntities } from "@/features/inbox/useReviewClusterEntities";
import { errorMessage } from "@/lib/errorMessage";
import {
  combineDiscardedItems,
  combineSummaryLine,
  hiddenSurvivorRedactsRevealedMentions,
} from "@/lib/inboxCombinePreview";
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
  const { entities: fullEntities, merges, isLoading } = useReviewClusterEntities(row.campaignId);
  const combineMutation = useCombineCluster();

  const clusterEntities = useMemo(() => {
    const clusterIds = new Set(row.entities.map((e) => e.id));
    return fullEntities.filter((e) => clusterIds.has(e.id));
  }, [row.entities, fullEntities]);
  // Full data hasn't landed (or an entity was deleted out from under us
  // concurrently) — the picker list and summary line below still render from
  // the inbox row's own summary shape; only the Discarded box's fuller
  // categories (dropped descriptions, prepared merges) wait on this.
  const previewReady = !isLoading && clusterEntities.length === row.entities.length;

  const loserIds = useMemo(
    () => row.entities.filter((e) => e.id !== survivorId).map((e) => e.id),
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
  const discardedItems = useMemo(
    () => [
      ...(redactionWarning ? [redactionWarning] : []),
      ...(previewReady ? combineDiscardedItems(clusterEntities, survivorId, merges) : []),
    ],
    [redactionWarning, previewReady, clusterEntities, survivorId, merges],
  );

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

        <DiscardedBox items={discardedItems} />

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
          loserCount={loserIds.length}
        />
      </div>
    </BottomSheet>
  );
}
