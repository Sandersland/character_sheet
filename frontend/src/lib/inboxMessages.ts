import type { InboxRow } from "@/types/character";

// App-level inbox (#1946), the frontend sibling of #1945's derived rows. Pure
// presentation logic only — no JSX, no network — so the row list, the bell,
// and their tests all read the same message text off one function.

export function inboxRowMessage(row: InboxRow): string {
  if (row.kind === "DUPLICATE_CLUSTER") {
    return `${row.entities.map((e) => e.name).join(" · ")} look like duplicates of each other.`;
  }
  const isOne = row.count === 1;
  return `${row.count} ${isOne ? "entry has" : "entries have"} been mentioned but ${isOne ? "has" : "have"} no description yet.`;
}

export interface InboxCampaignGroup {
  campaignId: string;
  campaignName: string;
  rows: InboxRow[];
}

// Groups rows by campaign without re-sorting: the backend already orders rows
// newest-signal-first, so a campaign's group position is wherever its first
// row appeared.
export function groupInboxRowsByCampaign(rows: InboxRow[]): InboxCampaignGroup[] {
  const groups: InboxCampaignGroup[] = [];
  const byId = new Map<string, InboxCampaignGroup>();
  for (const row of rows) {
    let group = byId.get(row.campaignId);
    if (!group) {
      group = { campaignId: row.campaignId, campaignName: row.campaignName, rows: [] };
      byId.set(row.campaignId, group);
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}
