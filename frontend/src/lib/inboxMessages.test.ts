import { describe, it, expect } from "vitest";

import { groupInboxRowsByCampaign, inboxRowMessage } from "@/lib/inboxMessages";
import type { InboxDuplicateClusterRow, InboxNeedsChroniclingRow, InboxRow } from "@/types/character";

function duplicateRow(overrides: Partial<InboxDuplicateClusterRow> = {}): InboxDuplicateClusterRow {
  return {
    kind: "DUPLICATE_CLUSTER",
    campaignId: "camp-1",
    campaignName: "Curse of Strahd",
    signature: "sig-1",
    entities: [
      { id: "e1", name: "Lil", type: "NPC", visibility: "REVEALED", mentionCount: 1 },
      { id: "e2", name: "lili", type: "NPC", visibility: "REVEALED", mentionCount: 0 },
      { id: "e3", name: "Lili", type: "NPC", visibility: "REVEALED", mentionCount: 3 },
    ],
    defaultSurvivorId: "e3",
    ...overrides,
  };
}

function chroniclingRow(overrides: Partial<InboxNeedsChroniclingRow> = {}): InboxNeedsChroniclingRow {
  return {
    kind: "NEEDS_CHRONICLING",
    campaignId: "camp-1",
    campaignName: "Curse of Strahd",
    signature: "camp-1",
    count: 4,
    ...overrides,
  };
}

describe("inboxRowMessage", () => {
  it("joins cluster entity names with a middle dot for a duplicate cluster", () => {
    expect(inboxRowMessage(duplicateRow())).toBe("Lil · lili · Lili look like duplicates of each other.");
  });

  it("pluralizes a needs-chronicling row's count", () => {
    expect(inboxRowMessage(chroniclingRow({ count: 4 }))).toBe(
      "4 entries have been mentioned but have no description yet.",
    );
  });

  it("uses singular phrasing for a single needs-chronicling entry", () => {
    expect(inboxRowMessage(chroniclingRow({ count: 1 }))).toBe(
      "1 entry has been mentioned but has no description yet.",
    );
  });
});

describe("groupInboxRowsByCampaign", () => {
  it("groups rows under their campaign, preserving first-seen campaign order", () => {
    const rows: InboxRow[] = [
      duplicateRow({ campaignId: "camp-2", campaignName: "Descent", signature: "sig-a" }),
      duplicateRow({ campaignId: "camp-1", campaignName: "Curse of Strahd", signature: "sig-b" }),
      chroniclingRow({ campaignId: "camp-2", campaignName: "Descent", signature: "camp-2" }),
    ];

    const groups = groupInboxRowsByCampaign(rows);

    expect(groups.map((g) => g.campaignId)).toEqual(["camp-2", "camp-1"]);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[1].rows).toHaveLength(1);
  });

  it("returns no groups for an empty inbox", () => {
    expect(groupInboxRowsByCampaign([])).toEqual([]);
  });
});
