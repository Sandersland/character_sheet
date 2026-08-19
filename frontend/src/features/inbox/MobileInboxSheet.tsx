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
}

// Mobile's inbox trigger (#1946): the same bell opens the app's usual
// BottomSheet instead of the desktop Popover, per the spec's "same trigger"
// instruction — owns its own open/close state since, unlike Popover, a
// BottomSheet isn't self-triggering.
export default function MobileInboxSheet({
  rows,
  label,
  onReviewDuplicates,
  onDisregard,
  disregardingSignature,
}: MobileInboxSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" aria-label={label} onClick={() => setOpen(true)}>
        <InboxBellTrigger count={rows.length} />
      </button>
      {open && (
        <BottomSheet title="Inbox" subtitle={`${rows.length} for the DM`} onClose={() => setOpen(false)}>
          {(requestClose) => (
            <InboxPanel
              rows={rows}
              mobile
              onReviewDuplicates={(row) => {
                requestClose();
                onReviewDuplicates(row);
              }}
              onDisregard={onDisregard}
              disregardingSignature={disregardingSignature}
              onNavigated={requestClose}
            />
          )}
        </BottomSheet>
      )}
    </>
  );
}
