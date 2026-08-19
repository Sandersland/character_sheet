import { useState } from "react";

import BottomSheet from "@/components/ui/BottomSheet";
import InboxBellTrigger from "@/features/inbox/InboxBellTrigger";
import InboxPanel from "@/features/inbox/InboxPanel";
import type { InboxDuplicateClusterRow, InboxRow } from "@/types/character";

interface MobileInboxSheetProps {
  rows: InboxRow[];
  label: string;
  onReviewDuplicates: (row: InboxDuplicateClusterRow) => void;
  onDisregard: (row: InboxRow) => void;
  disregardingSignature: string | null;
  /** Hides only the trigger button — an already-open sheet (mid drag-to-
   *  dismiss when the last row cleared) keeps rendering, and its own close
   *  animation, on its own `open` state regardless. */
  hideTrigger: boolean;
}

// Mobile's inbox trigger (#1946): the same bell opens the app's usual
// BottomSheet instead of the desktop Popover, per the spec's "same trigger"
// instruction — owns its own open/close state since, unlike Popover, a
// BottomSheet isn't self-triggering. Stays mounted even with hideTrigger set
// (rows empty): the trigger button and the sheet are independent — hiding one
// never unmounts the other, so a sheet that's mid-close-animation when the
// last row clears finishes that animation instead of vanishing instantly.
export default function MobileInboxSheet({
  rows,
  label,
  onReviewDuplicates,
  onDisregard,
  disregardingSignature,
  hideTrigger,
}: MobileInboxSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!hideTrigger && (
        <button type="button" aria-label={label} onClick={() => setOpen(true)}>
          <InboxBellTrigger count={rows.length} />
        </button>
      )}
      {open && (
        <BottomSheet title="Inbox" subtitle={`${rows.length} for the DM`} onClose={() => setOpen(false)}>
          {(requestClose) => (
            <InboxPanel
              rows={rows}
              mobile
              onReviewDuplicates={onReviewDuplicates}
              onDisregard={onDisregard}
              disregardingSignature={disregardingSignature}
              onRequestClose={requestClose}
            />
          )}
        </BottomSheet>
      )}
    </>
  );
}
