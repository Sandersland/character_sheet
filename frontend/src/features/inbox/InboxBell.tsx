import { useEffect, useState } from "react";

import DesktopInboxPopover from "@/features/inbox/DesktopInboxPopover";
import { useInbox } from "@/features/inbox/useInbox";
import MobileInboxSheet from "@/features/inbox/MobileInboxSheet";
import ReviewDuplicatesModal from "@/features/inbox/ReviewDuplicatesModal";
import { useDismissInboxFlag } from "@/features/inbox/useDismissInboxFlag";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import { errorMessage } from "@/lib/errorMessage";
import type { InboxDuplicateClusterRow, InboxRow } from "@/types/character";

const DISMISS_ERROR_TOAST_MS = 4000;

export default function InboxBell() {
  const { rows } = useInbox();
  const isMobile = useIsBelowMd();
  const [reviewRow, setReviewRow] = useState<InboxDuplicateClusterRow | null>(null);
  const dismissMutation = useDismissInboxFlag();
  const [dismissError, setDismissError] = useState<string | null>(null);

  useEffect(() => {
    if (!dismissMutation.error) return;
    setDismissError(errorMessage(dismissMutation.error, "Failed to disregard."));
  }, [dismissMutation.error]);

  // Keys on the error object, not the message string, so an identical repeated
  // failure gets a fresh timer window instead of inheriting the first toast's
  // remaining time.
  useEffect(() => {
    if (!dismissMutation.error) return;
    const timer = setTimeout(() => setDismissError(null), DISMISS_ERROR_TOAST_MS);
    return () => clearTimeout(timer);
  }, [dismissMutation.error]);

  function handleDisregard(row: InboxRow) {
    dismissMutation.mutate({ campaignId: row.campaignId, kind: row.kind, signature: row.signature });
  }

  function handleDisregardFromModal(row: InboxDuplicateClusterRow) {
    handleDisregard(row);
    setReviewRow(null);
  }

  const itemWord = rows.length === 1 ? "item" : "items";
  const label = `Inbox, ${rows.length} ${itemWord}`;
  const disregardingSignature =
    dismissMutation.isPending ? (dismissMutation.variables?.signature ?? null) : null;

  return (
    <div className="relative">
      {isMobile ? (
        <MobileInboxSheet
          rows={rows}
          label={label}
          onReviewDuplicates={setReviewRow}
          onDisregard={handleDisregard}
          disregardingSignature={disregardingSignature}
          hideTrigger={rows.length === 0}
        />
      ) : (
        rows.length > 0 && (
          <DesktopInboxPopover
            rows={rows}
            label={label}
            onReviewDuplicates={setReviewRow}
            onDisregard={handleDisregard}
            disregardingSignature={disregardingSignature}
          />
        )
      )}

      {dismissError && (
        <p
          role="status"
          className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-control bg-garnet-surface px-2.5 py-1.5 text-xs font-semibold text-garnet-on-surface shadow-raised"
        >
          {dismissError}
        </p>
      )}

      {reviewRow && (
        <ReviewDuplicatesModal
          // Remounts on cluster change so survivorId state re-initializes from the row's default.
          key={reviewRow.signature}
          row={reviewRow}
          onClose={() => setReviewRow(null)}
          onDisregard={handleDisregardFromModal}
          disregarding={disregardingSignature === reviewRow.signature}
        />
      )}
    </div>
  );
}
