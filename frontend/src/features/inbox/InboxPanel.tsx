import InboxRowItem from "@/features/inbox/InboxRowItem";
import { groupInboxRowsByCampaign } from "@/lib/inboxMessages";
import type { InboxDuplicateClusterRow, InboxRow } from "@/types/character";

interface InboxPanelProps {
  rows: InboxRow[];
  mobile: boolean;
  onReviewDuplicates: (row: InboxDuplicateClusterRow) => void;
  onDisregard: (row: InboxRow) => void;
  disregardingSignature: string | null;
  onRequestClose: () => void;
}

export default function InboxPanel({
  rows,
  mobile,
  onReviewDuplicates,
  onDisregard,
  disregardingSignature,
  onRequestClose,
}: InboxPanelProps) {
  const groups = groupInboxRowsByCampaign(rows);

  function handleReviewDuplicates(row: InboxDuplicateClusterRow) {
    onRequestClose();
    onReviewDuplicates(row);
  }

  return (
    <div className={mobile ? "flex flex-col" : "w-80"}>
      {groups.map((group) => (
        <div key={group.campaignId} className="border-b border-parchment-200 last:border-b-0">
          <div className="px-3 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
            {group.campaignName}
          </div>
          <ul className="divide-y divide-parchment-200">
            {group.rows.map((row) => (
              <InboxRowItem
                key={row.signature}
                row={row}
                mobile={mobile}
                onReviewDuplicates={handleReviewDuplicates}
                onDisregard={onDisregard}
                disregarding={disregardingSignature === row.signature}
                onRequestClose={onRequestClose}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
