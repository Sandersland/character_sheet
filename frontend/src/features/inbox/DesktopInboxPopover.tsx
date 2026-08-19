import Popover from "@/components/ui/Popover";
import InboxBellTrigger from "@/features/inbox/InboxBellTrigger";
import InboxPanel from "@/features/inbox/InboxPanel";
import type { InboxDuplicateClusterRow, InboxRow } from "@/types/character";

interface DesktopInboxPopoverProps {
  rows: InboxRow[];
  label: string;
  onReviewDuplicates: (row: InboxDuplicateClusterRow) => void;
  onDisregard: (row: InboxRow) => void;
  disregardingSignature: string | null;
}

// Desktop's inbox trigger (#1946): the bell anchors the existing Popover
// primitive, which owns its own open/close state.
export default function DesktopInboxPopover({
  rows,
  label,
  onReviewDuplicates,
  onDisregard,
  disregardingSignature,
}: DesktopInboxPopoverProps) {
  return (
    <Popover label={label} align="right" trigger={<InboxBellTrigger count={rows.length} />}>
      {(close) => (
        <InboxPanel
          rows={rows}
          mobile={false}
          onReviewDuplicates={(row) => {
            close();
            onReviewDuplicates(row);
          }}
          onDisregard={onDisregard}
          disregardingSignature={disregardingSignature}
          onNavigated={close}
        />
      )}
    </Popover>
  );
}
