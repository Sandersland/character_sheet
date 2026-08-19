import { describe, expect, it } from "vitest";

import {
  combineDiscardedItems,
  combineItemLinkTransferWarning,
  combineMentionSummary,
  combineRedactedMentionWarning,
  duplicateHasPreparedMerge,
} from "@/lib/combinePreview";
import type { CampaignEntity, CampaignEntityMerge } from "@/types/character";

function entity(overrides: Partial<CampaignEntity> = {}): CampaignEntity {
  return {
    id: "dup-1",
    campaignId: "c",
    type: "NPC",
    name: "lili",
    aliases: [],
    notes: null,
    visibility: "REVEALED",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function merge(overrides: Partial<CampaignEntityMerge> = {}): CampaignEntityMerge {
  return {
    id: "m1",
    campaignId: "c",
    mergedEntityId: "a",
    survivorEntityId: "b",
    status: "PREPARED",
    note: null,
    preparedAt: "2026-01-01T00:00:00.000Z",
    executedAt: null,
    ...overrides,
  };
}

describe("combineDiscardedItems", () => {
  const survivor = entity({ id: "surv-1", name: "Lili", type: "NPC" });

  it("is empty when the duplicate has no discardable content", () => {
    expect(combineDiscardedItems(entity(), survivor)).toEqual([]);
  });

  it("lists notes when present", () => {
    expect(combineDiscardedItems(entity({ notes: "A sellsword." }), survivor)).toEqual([
      { key: "notes", label: "Description/notes" },
    ]);
  });

  it("ignores whitespace-only notes", () => {
    expect(combineDiscardedItems(entity({ notes: "   " }), survivor)).toEqual([]);
  });

  it("lists aliases with their values", () => {
    expect(combineDiscardedItems(entity({ aliases: ["Lil", "Lilith"] }), survivor)).toEqual([
      { key: "aliases", label: "Aliases — Lil, Lilith" },
    ]);
  });

  it("lists a portrait", () => {
    expect(combineDiscardedItems(entity({ portraitUrl: "/portrait.png" }), survivor)).toEqual([
      { key: "portrait", label: "Portrait" },
    ]);
  });

  it("lists a differing type but not a matching one", () => {
    expect(combineDiscardedItems(entity({ type: "LOCATION" }), survivor)).toEqual([
      { key: "type", label: "Type — currently Location" },
    ]);
    expect(combineDiscardedItems(entity({ type: "NPC" }), survivor)).toEqual([]);
  });

  it("lists hidden visibility", () => {
    expect(combineDiscardedItems(entity({ visibility: "HIDDEN" }), survivor)).toEqual([
      { key: "visibility", label: "Hidden visibility" },
    ]);
  });

  it("lists every applicable item together, in order", () => {
    const loaded = entity({
      notes: "A sellsword.",
      aliases: ["Lil"],
      portraitUrl: "/p.png",
      type: "LOCATION",
      visibility: "HIDDEN",
    });
    expect(combineDiscardedItems(loaded, survivor).map((i) => i.key)).toEqual([
      "notes",
      "aliases",
      "portrait",
      "type",
      "visibility",
    ]);
  });
});

describe("combineMentionSummary", () => {
  it("singularizes a count of one and hedges toward private notes", () => {
    const dup = entity({
      stats: { mentionCount: 1, firstMentioned: null, lastMentioned: null, chroniclers: [], hasDescription: false },
    });
    expect(combineMentionSummary(dup, "Lili")).toBe(
      "1 mention in 1 journal entry move to Lili, plus any mentions in players' private notes",
    );
  });

  it("pluralizes a count above one and hedges toward private notes", () => {
    const dup = entity({
      stats: { mentionCount: 5, firstMentioned: null, lastMentioned: null, chroniclers: [], hasDescription: false },
    });
    expect(combineMentionSummary(dup, "Lili")).toBe(
      "5 mentions in 5 journal entries move to Lili, plus any mentions in players' private notes",
    );
  });

  it("defaults to zero when stats are absent, still hedging", () => {
    expect(combineMentionSummary(entity(), "Lili")).toBe(
      "0 mentions in 0 journal entries move to Lili, plus any mentions in players' private notes",
    );
  });
});

describe("combineRedactedMentionWarning", () => {
  it("warns when a REVEALED duplicate combines into a HIDDEN survivor", () => {
    expect(
      combineRedactedMentionWarning(
        entity({ visibility: "REVEALED" }),
        entity({ visibility: "HIDDEN" }),
      ),
    ).toBe(true);
  });

  it("is silent when the survivor is already REVEALED", () => {
    expect(
      combineRedactedMentionWarning(
        entity({ visibility: "REVEALED" }),
        entity({ visibility: "REVEALED" }),
      ),
    ).toBe(false);
  });

  it("is silent when the duplicate is itself HIDDEN — nothing was visible to lose", () => {
    expect(
      combineRedactedMentionWarning(
        entity({ visibility: "HIDDEN" }),
        entity({ visibility: "HIDDEN" }),
      ),
    ).toBe(false);
  });
});

describe("combineItemLinkTransferWarning", () => {
  const bareItemSurvivor = entity({ id: "surv-1", type: "ITEM", itemId: null });

  it("warns when an ITEM duplicate fronting a campaign item combines into a bare ITEM survivor", () => {
    expect(combineItemLinkTransferWarning("ITEM", bareItemSurvivor, true)).toBe(true);
  });

  it("is silent when the duplicate doesn't front a campaign item", () => {
    expect(combineItemLinkTransferWarning("ITEM", bareItemSurvivor, false)).toBe(false);
  });

  it("is silent when the survivor isn't ITEM-typed", () => {
    expect(combineItemLinkTransferWarning("ITEM", entity({ type: "NPC" }), true)).toBe(false);
  });

  it("is silent when the duplicate isn't ITEM-typed", () => {
    expect(combineItemLinkTransferWarning("NPC", bareItemSurvivor, true)).toBe(false);
  });

  it("is silent when the survivor already fronts its own item — the combine 409s instead", () => {
    const linkedSurvivor = entity({ id: "surv-1", type: "ITEM", itemId: "item-9" });
    expect(combineItemLinkTransferWarning("ITEM", linkedSurvivor, true)).toBe(false);
  });
});

describe("duplicateHasPreparedMerge", () => {
  it("is true when the duplicate is the PREPARED old identity", () => {
    expect(duplicateHasPreparedMerge([merge({ mergedEntityId: "dup-1" })], "dup-1")).toBe(true);
  });

  it("is true when the duplicate is the PREPARED stand-in survivor", () => {
    expect(duplicateHasPreparedMerge([merge({ survivorEntityId: "dup-1" })], "dup-1")).toBe(true);
  });

  it("is false for an EXECUTED merge involving the duplicate", () => {
    expect(
      duplicateHasPreparedMerge([merge({ mergedEntityId: "dup-1", status: "EXECUTED" })], "dup-1"),
    ).toBe(false);
  });

  it("is false when the duplicate isn't in any merge", () => {
    expect(duplicateHasPreparedMerge([merge()], "dup-1")).toBe(false);
  });
});
