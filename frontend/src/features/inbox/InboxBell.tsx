import { useEffect, useState } from "react";

import DesktopInboxPopover from "@/features/inbox/DesktopInboxPopover";
import { useInbox } from "@/features/inbox/useInbox";
import MobileInboxSheet from "@/features/inbox/MobileInboxSheet";
import ReviewDuplicatesModal from "@/features/inbox/ReviewDuplicatesModal";
import { useDismissInboxFlag } from "@/features/inbox/useDismissInboxFlag";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import { errorMessage } from "@/lib/errorMessage";
import type { InboxDuplicateClusterRow, InboxRow } from "@/types/character";

// How long a failed-dismissal toast lingers before self-clearing — matches
// this app's other self-dismissing status messages (CampaignInviteLink's
// "Copied to clipboard" note uses the same state+timer shape).
const DISMISS_ERROR_TOAST_MS = 4000;

// AppHeader's inbox entry point (#1946): DM housekeeping derived across every
// campaign the caller owns (duplicate-name clusters, needs-chronicling
// counts — #1945). The bell is hidden entirely when the feed is empty — this
// is the first icon-only control in the app besides the avatar (deliberate,
// #1946). But `rows` never unmounts the Review modal or a currently-open
// mobile sheet: ReviewDuplicatesModal renders off its own `reviewRow` state,
// independent of rows, and MobileInboxSheet stays mounted with only its
// TRIGGER hidden (hideTrigger) so a BottomSheet mid drag-to-dismiss finishes
// that animation instead of vanishing instantly if a background refetch
// empties the inbox under it. DesktopInboxPopover has no such animation to
// protect — by the time a row click opens the Review modal, InboxPanel has
// already closed the popover itself — so it mounts plainly on rows.length,
// same as before; forcing it to linger empty-but-labeled would be a real
// accessibility regression for no real benefit.
export default function InboxBell() {
  const { rows } = useInbox();
  const isMobile = useIsBelowMd();
  const [reviewRow, setReviewRow] = useState<InboxDuplicateClusterRow | null>(null);
  const dismissMutation = useDismissInboxFlag();
  const [dismissError, setDismissError] = useState<string | null>(null);

  // A failed dismissal is otherwise silent: the optimistic row removal rolls
  // back invisibly, with nothing telling the DM why the row reappeared.
  useEffect(() => {
    if (!dismissMutation.error) return;
    setDismissError(errorMessage(dismissMutation.error, "Failed to disregard."));
  }, [dismissMutation.error]);

  // Timer keys on the error OBJECT, not the message string: a second failure
  // with an identical message is a state no-op that would otherwise inherit
  // the first toast's remaining time instead of a fresh window.
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
          // Remount on cluster change: survivorId state initializes from the
          // row's default exactly once per mount.
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
