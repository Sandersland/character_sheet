import { describe, it, expect } from "vitest";

import {
  combineDiscardedItems,
  combineSummaryLine,
  hiddenSurvivorRedactsRevealedMentions,
  losersOf,
} from "@/lib/inboxCombinePreview";
import type { CampaignEntity, CampaignEntityMerge, InboxDuplicateEntity } from "@/types/character";

function inboxEntity(overrides: Partial<InboxDuplicateEntity> = {}): InboxDuplicateEntity {
  return {
    id: "e1",
    name: "Lil",
    type: "NPC",
    visibility: "REVEALED",
    mentionCount: 0,
    ...overrides,
  };
}

function entity(overrides: Partial<CampaignEntity> = {}): CampaignEntity {
  return {
    id: "e1",
    campaignId: "camp-1",
    type: "NPC",
    name: "Lil",
    aliases: [],
    notes: null,
    visibility: "REVEALED",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("losersOf", () => {
  it("returns every entity except the chosen survivor", () => {
    const entities = [entity({ id: "e1" }), entity({ id: "e2" }), entity({ id: "e3" })];
    expect(losersOf(entities, "e2").map((e) => e.id)).toEqual(["e1", "e3"]);
  });
});

describe("combineSummaryLine", () => {
  it("matches the spec example: singular mention, plural rows — fed the inbox row's own lightweight entities", () => {
    const entities = [
      inboxEntity({ id: "e1", name: "Lil", mentionCount: 1 }),
      inboxEntity({ id: "e2", name: "lili", mentionCount: 0 }),
      inboxEntity({ id: "e3", name: "Lili", mentionCount: 3 }),
    ];
    expect(combineSummaryLine(entities, "e3")).toBe("1 mention moves to Lili · 2 rows deleted");
  });

  it("pluralizes mentions and singularizes a lone deleted row", () => {
    const entities = [
      inboxEntity({ id: "e1", name: "Lil", mentionCount: 2 }),
      inboxEntity({ id: "e2", name: "Lili", mentionCount: 0 }),
    ];
    expect(combineSummaryLine(entities, "e2")).toBe("2 mentions move to Lili · 1 row deleted");
  });
});

describe("combineDiscardedItems", () => {
  it("lists hidden losers, described losers, and prepared-merge losers by name", () => {
    const entities = [
      entity({ id: "e1", name: "Lil", visibility: "HIDDEN", stats: { mentionCount: 0, firstMentioned: null, lastMentioned: null, chroniclers: [], hasDescription: true } }),
      entity({ id: "e2", name: "lili" }),
      entity({ id: "e3", name: "Lili" }),
    ];
    const merges: CampaignEntityMerge[] = [
      {
        id: "m1",
        campaignId: "camp-1",
        mergedEntityId: "e2",
        survivorEntityId: "some-other",
        status: "PREPARED",
        note: null,
        preparedAt: "",
        executedAt: null,
      },
    ];

    const items = combineDiscardedItems(entities, "e3", merges);

    expect(items).toEqual([
      { key: "visibility", label: "Hidden visibility — Lil" },
      { key: "notes", label: "Descriptions — Lil" },
      { key: "merge", label: "Prepared identity merges — lili" },
    ]);
  });

  it("returns nothing to discard when the losers carry no real losses", () => {
    const entities = [entity({ id: "e1", name: "Lil" }), entity({ id: "e2", name: "Lili" })];
    expect(combineDiscardedItems(entities, "e2", [])).toEqual([]);
  });

  it("ignores an EXECUTED merge — only a PREPARED one is a real loss", () => {
    const entities = [entity({ id: "e1", name: "Lil" }), entity({ id: "e2", name: "Lili" })];
    const merges: CampaignEntityMerge[] = [
      {
        id: "m1",
        campaignId: "camp-1",
        mergedEntityId: "e1",
        survivorEntityId: "x",
        status: "EXECUTED",
        note: null,
        preparedAt: "",
        executedAt: "2026-01-01",
      },
    ];
    expect(combineDiscardedItems(entities, "e2", merges)).toEqual([]);
  });
});

describe("hiddenSurvivorRedactsRevealedMentions", () => {
  it("null when the survivor is REVEALED, whatever the losers' visibility", () => {
    const entities = [
      inboxEntity({ id: "e1", name: "Lil", visibility: "REVEALED" }),
      inboxEntity({ id: "e2", name: "Lili", visibility: "REVEALED" }),
    ];
    expect(hiddenSurvivorRedactsRevealedMentions(entities, "e2")).toBeNull();
  });

  it("null when the survivor is HIDDEN but every loser is already HIDDEN too", () => {
    const entities = [
      inboxEntity({ id: "e1", name: "Lil", visibility: "HIDDEN" }),
      inboxEntity({ id: "e2", name: "Lili", visibility: "HIDDEN" }),
    ];
    expect(hiddenSurvivorRedactsRevealedMentions(entities, "e2")).toBeNull();
  });

  it("warns, naming the REVEALED losers, when a HIDDEN survivor absorbs a REVEALED entity", () => {
    const entities = [
      inboxEntity({ id: "e1", name: "Lil", visibility: "REVEALED" }),
      inboxEntity({ id: "e2", name: "lili", visibility: "HIDDEN" }),
      inboxEntity({ id: "e3", name: "Lili", visibility: "HIDDEN" }),
    ];
    expect(hiddenSurvivorRedactsRevealedMentions(entities, "e3")).toEqual({
      key: "redacted-until-revealed",
      label: 'Mentions from Lil will render as "Hidden" until Lili is revealed',
    });
  });

  it("names every REVEALED loser, not just one", () => {
    const entities = [
      inboxEntity({ id: "e1", name: "Lil", visibility: "REVEALED" }),
      inboxEntity({ id: "e2", name: "lili", visibility: "REVEALED" }),
      inboxEntity({ id: "e3", name: "Lili", visibility: "HIDDEN" }),
    ];
    expect(hiddenSurvivorRedactsRevealedMentions(entities, "e3")?.label).toBe(
      'Mentions from Lil, lili will render as "Hidden" until Lili is revealed',
    );
  });
});
