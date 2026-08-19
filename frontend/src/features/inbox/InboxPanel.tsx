import { Lock } from "@/components/ui/icons";
import InboxRowItem from "@/features/inbox/InboxRowItem";
import { groupInboxRowsByCampaign } from "@/lib/inboxMessages";
import type { InboxDuplicateClusterRow, InboxRow } from "@/types/character";

interface InboxPanelProps {
  rows: InboxRow[];
  mobile: boolean;
  onReviewDuplicates: (row: InboxDuplicateClusterRow) => void;
  onDisregard: (row: InboxRow) => void;
  disregardingSignature: string | null;
  onNavigated: () => void;
}

// Row list shared by the desktop popover and the mobile BottomSheet (#1946) —
// every campaign the caller owns is, by construction, one this caller DMs
// (GET /api/inbox is owner-scoped), so the "DM only" badge is constant per
// group rather than conditional: it's read as "this group is DM housekeeping",
// not as a per-campaign role check.
export default function InboxPanel({
  rows,
  mobile,
  onReviewDuplicates,
  onDisregard,
  disregardingSignature,
  onNavigated,
}: InboxPanelProps) {
  const groups = groupInboxRowsByCampaign(rows);

  return (
    <div className={mobile ? "flex flex-col" : "w-80"}>
      {groups.map((group) => (
        <div key={group.campaignId} className="border-b border-parchment-200 last:border-b-0">
          <div className="flex items-center gap-1.5 px-3 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
            <span>{group.campaignName}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-parchment-100 px-1.5 py-0.5 text-parchment-500">
              <Lock aria-hidden="true" className="h-2.5 w-2.5" />
              DM only
            </span>
          </div>
          <ul className="divide-y divide-parchment-200">
            {group.rows.map((row) => (
              <InboxRowItem
                key={row.signature}
                row={row}
                mobile={mobile}
                onReviewDuplicates={onReviewDuplicates}
                onDisregard={onDisregard}
                disregarding={disregardingSignature === row.signature}
                onNavigated={onNavigated}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
