import { useNavigate } from "react-router-dom";

import { Copy, ScrollText } from "@/components/ui/icons";
import { formatInboxSignalAge, inboxRowMessage } from "@/lib/inboxMessages";
import type { InboxDuplicateClusterRow, InboxRow } from "@/types/character";

// Mixes a lucide-react icon (Copy/ScrollText) into one Record below, so the
// prop type has to fit both icon families rather than react-icons' own
// IconType — same reasoning as OptionCard's OptionIcon.
type RowIcon = React.ComponentType<{ className?: string; "aria-hidden"?: React.AriaAttributes["aria-hidden"] }>;

interface InboxRowItemProps {
  row: InboxRow;
  /** Full-width 44px targets on the mobile sheet vs. compact text links in the desktop popover. */
  mobile: boolean;
  onReviewDuplicates: (row: InboxDuplicateClusterRow) => void;
  onDisregard: (row: InboxRow) => void;
  disregarding: boolean;
  /** Fires after "Open codex" navigates, so the caller can close the popover/sheet it lives in. */
  onRequestClose: () => void;
}

// Color-free base classes — each call site below adds EXACTLY ONE text-color
// utility on top. The old version built the Disregard button by string-
// appending a second color class after the primary action's, two classes of
// equal specificity competing for the same property with the winner decided
// by generated-CSS source order rather than anything visible in the JSX.
const desktopActionBase = "text-xs font-semibold hover:underline disabled:opacity-40";
const mobileActionBase =
  "flex min-h-11 flex-1 items-center justify-center rounded-control border border-parchment-300 px-3 text-sm font-semibold hover:bg-parchment-100 disabled:opacity-40";

// One icon per inbox row kind (#1527-class total mapping): a Record forces
// every InboxRow["kind"] to have an entry, so the compiler — not a silent
// fallback — flags a new kind added to the union without an icon here.
const ROW_ICON: Record<InboxRow["kind"], RowIcon> = {
  // Small stroke icon reused from the session log — both read as "an entry
  // wants your attention".
  DUPLICATE_CLUSTER: Copy,
  NEEDS_CHRONICLING: ScrollText,
};

// The row's primary action differs in both label AND the type of row it needs
// (Review duplicates only makes sense typed to InboxDuplicateClusterRow), so
// a Record lookup can't carry it the way ROW_ICON does above — a switch with
// an assertNever-typed default does the same job: TypeScript rejects this
// file the moment InboxRow gains a third kind with no case here.
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

// One inbox row (#1946): a small stroke icon, the row's message with a
// trailing relative-time stamp off signalAt (formatInboxSignalAge — a LOCAL
// calendar-day bucketing, since signalAt is a real wall-clock instant, unlike
// formatRelativeDay's UTC-anchored journal dates), and its actions.
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
