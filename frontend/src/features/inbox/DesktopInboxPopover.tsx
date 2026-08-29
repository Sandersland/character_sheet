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
          onReviewDuplicates={onReviewDuplicates}
          onDisregard={onDisregard}
          disregardingSignature={disregardingSignature}
          onRequestClose={close}
        />
      )}
    </Popover>
  );
}
