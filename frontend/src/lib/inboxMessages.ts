import type { InboxRow } from "@/types/character";

export function inboxRowMessage(row: InboxRow): string {
  switch (row.kind) {
    case "DUPLICATE_CLUSTER":
      return `${row.entities.map((e) => e.name).join(" · ")} look like duplicates of each other.`;
    case "NEEDS_CHRONICLING": {
      const isOne = row.count === 1;
      return `${row.count} ${isOne ? "entry has" : "entries have"} been mentioned but ${isOne ? "has" : "have"} no description yet.`;
    }
    default: {
      const exhaustive: never = row;
      return exhaustive;
    }
  }
}

export interface InboxCampaignGroup {
  campaignId: string;
  campaignName: string;
  rows: InboxRow[];
}

// Groups without re-sorting: the backend already orders rows newest-signal-first, so a group's position is wherever its first row appeared.
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

const DAY_MS = 86_400_000;

function localMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Deliberately not formatRelativeDay: that one buckets by UTC calendar day (correct for a journal date), but signalAt is a real wall-clock instant, so this buckets by the READER's local calendar day instead.
export function formatInboxSignalAge(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = Math.round((localMidnight(new Date()) - localMidnight(d)) / DAY_MS);
  // Strictly negative = a future local day (bad clock/data) — show the absolute date rather than an indefinite "today".
  if (days < 0)
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 30) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
