import { useState } from "react";

import DesktopInboxPopover from "@/features/inbox/DesktopInboxPopover";
import MobileInboxSheet from "@/features/inbox/MobileInboxSheet";
import ReviewDuplicatesModal from "@/features/inbox/ReviewDuplicatesModal";
import { useDismissInboxFlag } from "@/features/inbox/useDismissInboxFlag";
import { useInbox } from "@/hooks/useInbox";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import type { InboxDuplicateClusterRow, InboxRow } from "@/types/character";

// AppHeader's inbox entry point (#1946): DM housekeeping derived across every
// campaign the caller owns (duplicate-name clusters, needs-chronicling
// counts — #1945). Hidden entirely when the feed is empty — this is the
// first icon-only control in the app besides the avatar (deliberate, #1946),
// so it only earns a permanent header slot by being invisible the rest of
// the time. Desktop opens the existing Popover under the bell; mobile opens
// the same responsive BottomSheet every other mobile picker in this app uses
// — DesktopInboxPopover/MobileInboxSheet own that split so this component
// only owns the state shared across both (the Review modal, the dismiss
// mutation) rather than branching on viewport itself.
export default function InboxBell() {
  const { rows } = useInbox();
  const isMobile = useIsBelowMd();
  const [reviewRow, setReviewRow] = useState<InboxDuplicateClusterRow | null>(null);
  const dismissMutation = useDismissInboxFlag();

  if (rows.length === 0) return null;

  function handleDisregard(row: InboxRow) {
    dismissMutation.mutate({ campaignId: row.campaignId, kind: row.kind, signature: row.signature });
  }

  const itemWord = rows.length === 1 ? "item" : "items";
  const triggerProps = {
    rows,
    label: `Inbox, ${rows.length} ${itemWord}`,
    onReviewDuplicates: setReviewRow,
    onDisregard: handleDisregard,
    disregardingSignature: dismissMutation.isPending ? (dismissMutation.variables?.signature ?? null) : null,
  };

  return (
    <>
      {isMobile ? <MobileInboxSheet {...triggerProps} /> : <DesktopInboxPopover {...triggerProps} />}

      {reviewRow && (
        <ReviewDuplicatesModal
          row={reviewRow}
          onClose={() => setReviewRow(null)}
          onDisregard={(row) => {
            handleDisregard(row);
            setReviewRow(null);
          }}
          disregarding={dismissMutation.isPending}
        />
      )}
    </>
  );
}
