import { useNavigate } from "react-router-dom";

import { Copy, ScrollText } from "@/components/ui/icons";
import { formatInboxSignalAge, inboxRowMessage } from "@/lib/inboxMessages";
import type { InboxDuplicateClusterRow, InboxRow } from "@/types/character";

// RowIcon must fit lucide-react icon components, so it can't reuse react-icons' own IconType — same shape as OptionCard's OptionIcon.
type RowIcon = React.ComponentType<{ className?: string; "aria-hidden"?: React.AriaAttributes["aria-hidden"] }>;

interface InboxRowItemProps {
  row: InboxRow;
  /** Full-width 44px targets on the mobile sheet vs. compact text links in the desktop popover. */
  mobile: boolean;
  onReviewDuplicates: (row: InboxDuplicateClusterRow) => void;
  onDisregard: (row: InboxRow) => void;
  disregarding: boolean;
  onRequestClose: () => void;
}

// Base classes are color-free; each call site adds exactly one text-color utility on top, since two same-specificity color classes would let source order decide the winner.
const desktopActionBase = "text-xs font-semibold hover:underline disabled:opacity-40";
const mobileActionBase =
  "flex min-h-11 flex-1 items-center justify-center rounded-control border border-parchment-300 px-3 text-sm font-semibold hover:bg-parchment-100 disabled:opacity-40";

const ROW_ICON: Record<InboxRow["kind"], RowIcon> = {
  DUPLICATE_CLUSTER: Copy,
  NEEDS_CHRONICLING: ScrollText,
};

function InboxRowPrimaryAction({
  row,
  className,
  onReviewDuplicates,
  onOpenCodex,
}: {
  row: InboxRow;
  className: string;
  onReviewDuplicates: (row: InboxDuplicateClusterRow) => void;
  onOpenCodex: () => void;
}) {
  switch (row.kind) {
    case "DUPLICATE_CLUSTER":
      return (
        <button type="button" onClick={() => onReviewDuplicates(row)} className={className}>
          Review duplicates
        </button>
      );
    case "NEEDS_CHRONICLING":
      return (
        <button type="button" onClick={onOpenCodex} className={className}>
          Open codex
        </button>
      );
    default: {
      const exhaustive: never = row;
      throw new Error(`InboxRowPrimaryAction: unhandled inbox row kind ${JSON.stringify(exhaustive)}`);
    }
  }
}

// formatInboxSignalAge buckets by LOCAL calendar day (signalAt is a wall-clock instant), unlike formatRelativeDay's UTC-anchored journal dates.
export default function InboxRowItem({
  row,
  mobile,
  onReviewDuplicates,
  onDisregard,
  disregarding,
  onRequestClose,
}: InboxRowItemProps) {
  const navigate = useNavigate();
  const Icon = ROW_ICON[row.kind];

  function handleOpenCodex() {
    navigate(`/campaigns/${row.campaignId}/codex`);
    onRequestClose();
  }

  const primaryActionClass = mobile
    ? `${mobileActionBase} text-parchment-800`
    : `${desktopActionBase} text-garnet-700`;
  const disregardClass = mobile
    ? `${mobileActionBase} text-garnet-700`
    : `${desktopActionBase} text-parchment-500`;

  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-parchment-500" />
          <p className="text-sm text-parchment-800">{inboxRowMessage(row)}</p>
        </div>
        <span className="shrink-0 pl-2 text-[11px] text-parchment-400">{formatInboxSignalAge(row.signalAt)}</span>
      </div>
      <div className={mobile ? "flex gap-2" : "flex items-center gap-4 pl-6"}>
        <InboxRowPrimaryAction
          row={row}
          className={primaryActionClass}
          onReviewDuplicates={onReviewDuplicates}
          onOpenCodex={handleOpenCodex}
        />
        <button type="button" onClick={() => onDisregard(row)} disabled={disregarding} className={disregardClass}>
          Disregard
        </button>
      </div>
    </li>
  );
}
