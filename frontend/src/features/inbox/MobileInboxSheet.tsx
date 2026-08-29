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
  /** Hides only the trigger button; an already-open sheet keeps rendering (and finishing its close animation) regardless of this prop. */
  hideTrigger: boolean;
}

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
        <BottomSheet
          title="Inbox"
          subtitle={`${rows.length} ${rows.length === 1 ? "item" : "items"}`}
          onClose={() => setOpen(false)}
        >
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
