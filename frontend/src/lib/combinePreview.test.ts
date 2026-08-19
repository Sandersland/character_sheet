import { describe, expect, it } from "vitest";

import {
  combineDiscardedItems,
  combineItemLinkTransferWarning,
  combineMentionSummary,
  combineRedactedMentionWarning,
  duplicateHasPreparedMerge,
  losersOf,
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

describe("losersOf", () => {
  it("returns every entity except the chosen survivor", () => {
    const entities = [entity({ id: "e1" }), entity({ id: "e2" }), entity({ id: "e3" })];
    expect(losersOf(entities, "e2").map((e) => e.id)).toEqual(["e1", "e3"]);
  });
});

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

  it("is empty when the sole loser has no discardable content", () => {
    expect(combineDiscardedItems([entity()], survivor)).toEqual([]);
  });

  it("lists notes when present, naming no one — the dialog already names the sole loser", () => {
    expect(combineDiscardedItems([entity({ notes: "A sellsword." })], survivor)).toEqual([
      { key: "notes", label: "Description/notes" },
    ]);
  });

  it("ignores whitespace-only notes", () => {
    expect(combineDiscardedItems([entity({ notes: "   " })], survivor)).toEqual([]);
  });

  it("lists a sole loser's aliases with their values", () => {
    expect(combineDiscardedItems([entity({ aliases: ["Lil", "Lilith"] })], survivor)).toEqual([
      { key: "aliases", label: "Aliases — Lil, Lilith" },
    ]);
  });

  it("lists a portrait", () => {
    expect(combineDiscardedItems([entity({ portraitUrl: "/portrait.png" })], survivor)).toEqual([
      { key: "portrait", label: "Portrait" },
    ]);
  });

  it("lists a differing type but not a matching one", () => {
    expect(combineDiscardedItems([entity({ type: "LOCATION" })], survivor)).toEqual([
      { key: "type", label: "Type — currently Location" },
    ]);
    expect(combineDiscardedItems([entity({ type: "NPC" })], survivor)).toEqual([]);
  });

  it("lists hidden visibility", () => {
    expect(combineDiscardedItems([entity({ visibility: "HIDDEN" })], survivor)).toEqual([
      { key: "visibility", label: "Hidden visibility" },
    ]);
  });

  it("lists every applicable item together, in order, for a single loser", () => {
    const loaded = entity({
      notes: "A sellsword.",
      aliases: ["Lil"],
      portraitUrl: "/p.png",
      type: "LOCATION",
      visibility: "HIDDEN",
    });
    expect(combineDiscardedItems([loaded], survivor).map((i) => i.key)).toEqual([
      "notes",
      "aliases",
      "portrait",
      "type",
      "visibility",
    ]);
  });

  it("names WHICH losers carry each category once there's more than one — no single subject left to imply it", () => {
    const losers = [
      entity({ id: "l1", name: "Lil", visibility: "HIDDEN" }),
      entity({ id: "l2", name: "lili", notes: "A hedge witch." }),
      entity({ id: "l3", name: "Lilith" }),
    ];
    expect(combineDiscardedItems(losers, survivor)).toEqual([
      { key: "notes", label: "Descriptions — lili" },
      { key: "visibility", label: "Hidden visibility — Lil" },
    ]);
  });

  it("names every affected loser for a category, not just one", () => {
    const losers = [
      entity({ id: "l1", name: "Lil", portraitUrl: "/a.png" }),
      entity({ id: "l2", name: "lili", portraitUrl: "/b.png" }),
    ];
    expect(combineDiscardedItems(losers, survivor)).toEqual([
      { key: "portrait", label: "Portraits — Lil, lili" },
    ]);
  });

  it("names losers with a differing type, N-way", () => {
    const losers = [
      entity({ id: "l1", name: "Lil", type: "LOCATION" }),
      entity({ id: "l2", name: "lili", type: "NPC" }),
    ];
    expect(combineDiscardedItems(losers, survivor)).toEqual([{ key: "type", label: "Type — Lil" }]);
  });

  it("names losers with aliases, N-way, without spelling out every value", () => {
    const losers = [
      entity({ id: "l1", name: "Lil", aliases: ["The Fox"] }),
      entity({ id: "l2", name: "lili", aliases: [] }),
    ];
    expect(combineDiscardedItems(losers, survivor)).toEqual([{ key: "aliases", label: "Aliases — Lil" }]);
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
