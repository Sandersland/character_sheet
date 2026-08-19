import { useNavigate } from "react-router-dom";

import { Copy, ScrollText } from "@/components/ui/icons";
import { inboxRowMessage } from "@/lib/inboxMessages";
import type { InboxDuplicateClusterRow, InboxRow } from "@/types/character";

interface InboxRowItemProps {
  row: InboxRow;
  /** Full-width 44px targets on the mobile sheet vs. compact text links in the desktop popover. */
  mobile: boolean;
  onReviewDuplicates: (row: InboxDuplicateClusterRow) => void;
  onDisregard: (row: InboxRow) => void;
  disregarding: boolean;
  /** Fires after "Open codex" navigates, so the caller can close the popover/sheet it lives in. */
  onNavigated: () => void;
}

const desktopAction = "text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40";
const mobileAction =
  "flex min-h-11 flex-1 items-center justify-center rounded-control border border-parchment-300 px-3 text-sm font-semibold text-parchment-800 hover:bg-parchment-100 disabled:opacity-40";
const mobileDisregard =
  "flex min-h-11 flex-1 items-center justify-center rounded-control border border-parchment-300 px-3 text-sm font-semibold text-garnet-700 hover:bg-parchment-100 disabled:opacity-40";

// One inbox row (#1946): a small stroke icon (Copy for a duplicate cluster,
// ScrollText for needs-chronicling — reused from the session log, both read
// as "an entry wants your attention"), the row's message, and its actions.
//
// No relative-time meta here: GET /api/inbox derives a `signalAt` internally
// for sort order (lib/campaign/inbox.ts) but doesn't serialize it onto the
// wire InboxRow — there's nothing to format. Needs a backend follow-up
// (surface signalAt) before this row can carry one.
export default function InboxRowItem({
  row,
  mobile,
  onReviewDuplicates,
  onDisregard,
  disregarding,
  onNavigated,
}: InboxRowItemProps) {
  const navigate = useNavigate();
  const Icon = row.kind === "DUPLICATE_CLUSTER" ? Copy : ScrollText;

  function handleOpenCodex() {
    navigate(`/campaigns/${row.campaignId}/codex`);
    onNavigated();
  }

  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-start gap-2">
        <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-parchment-500" />
        <p className="text-sm text-parchment-800">{inboxRowMessage(row)}</p>
      </div>
      <div className={mobile ? "flex gap-2" : "flex items-center gap-4 pl-6"}>
        {row.kind === "DUPLICATE_CLUSTER" ? (
          <button
            type="button"
            onClick={() => onReviewDuplicates(row)}
            className={mobile ? mobileAction : desktopAction}
          >
            Review duplicates
          </button>
        ) : (
          <button type="button" onClick={handleOpenCodex} className={mobile ? mobileAction : desktopAction}>
            Open codex
          </button>
        )}
        <button
          type="button"
          onClick={() => onDisregard(row)}
          disabled={disregarding}
          className={mobile ? mobileDisregard : `${desktopAction} text-parchment-500`}
        >
          Disregard
        </button>
      </div>
    </li>
  );
}
