import { describe, it, expect } from "vitest";

import {
  combineSummaryLine,
  hiddenSurvivorRedactsRevealedMentions,
  preparedMergeDiscardedItem,
} from "@/lib/inboxCombinePreview";
import type { CampaignEntityMerge, InboxDuplicateEntity } from "@/types/character";

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

function merge(overrides: Partial<CampaignEntityMerge> = {}): CampaignEntityMerge {
  return {
    id: "m1",
    campaignId: "camp-1",
    mergedEntityId: "a",
    survivorEntityId: "b",
    status: "PREPARED",
    note: null,
    preparedAt: "",
    executedAt: null,
    ...overrides,
  };
}

describe("combineSummaryLine", () => {
  it("matches the spec example: singular mention, plural rows, plus the private-notes hedge — fed the inbox row's own lightweight entities", () => {
    const entities = [
      inboxEntity({ id: "e1", name: "Lil", mentionCount: 1 }),
      inboxEntity({ id: "e2", name: "lili", mentionCount: 0 }),
      inboxEntity({ id: "e3", name: "Lili", mentionCount: 3 }),
    ];
    expect(combineSummaryLine(entities, "e3")).toBe(
      "1 mention moves to Lili, plus any in players' private notes · 2 rows deleted",
    );
  });

  it("pluralizes mentions and singularizes a lone deleted row", () => {
    const entities = [
      inboxEntity({ id: "e1", name: "Lil", mentionCount: 2 }),
      inboxEntity({ id: "e2", name: "Lili", mentionCount: 0 }),
    ];
    expect(combineSummaryLine(entities, "e2")).toBe(
      "2 mentions move to Lili, plus any in players' private notes · 1 row deleted",
    );
  });

  it("still hedges even when the viewer-scoped mention count is zero — a loser can carry private mentions the DM's count says nothing about", () => {
    const entities = [
      inboxEntity({ id: "e1", name: "Lil", mentionCount: 0 }),
      inboxEntity({ id: "e2", name: "Lili", mentionCount: 0 }),
    ];
    expect(combineSummaryLine(entities, "e2")).toBe(
      "0 mentions move to Lili, plus any in players' private notes · 1 row deleted",
    );
  });

  it("never shows an exact private-note count — only the fixed hedge phrase, regardless of cluster size", () => {
    const entities = [
      inboxEntity({ id: "e1", name: "Lil", mentionCount: 5 }),
      inboxEntity({ id: "e2", name: "lili", mentionCount: 7 }),
      inboxEntity({ id: "e3", name: "Lili", mentionCount: 0 }),
    ];
    const line = combineSummaryLine(entities, "e3");
    expect(line).toContain("plus any in players' private notes");
    // No stray digit sits inside the hedge clause itself.
    expect(line.split("plus any in players' private notes")[1].split("·")[0]).not.toMatch(/\d/);
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

describe("preparedMergeDiscardedItem", () => {
  it("names losers that own a PREPARED identity merge, either side of it", () => {
    const losers = [
      { id: "e1", name: "Lil" },
      { id: "e2", name: "lili" },
    ];
    const merges = [merge({ mergedEntityId: "e1" })];
    expect(preparedMergeDiscardedItem(losers, merges)).toEqual({
      key: "merge",
      label: "Prepared identity merges — Lil",
    });
  });

  it("names every affected loser, not just one", () => {
    const losers = [
      { id: "e1", name: "Lil" },
      { id: "e2", name: "lili" },
    ];
    const merges = [merge({ mergedEntityId: "e1" }), merge({ survivorEntityId: "e2" })];
    expect(preparedMergeDiscardedItem(losers, merges)?.label).toBe(
      "Prepared identity merges — Lil, lili",
    );
  });

  it("is null when no loser is in a PREPARED merge", () => {
    const losers = [{ id: "e1", name: "Lil" }];
    expect(preparedMergeDiscardedItem(losers, [])).toBeNull();
  });

  it("ignores an EXECUTED merge — only a PREPARED one is a real loss (reuses duplicateHasPreparedMerge's own status filter)", () => {
    const losers = [{ id: "e1", name: "Lil" }];
    const merges = [merge({ mergedEntityId: "e1", status: "EXECUTED" })];
    expect(preparedMergeDiscardedItem(losers, merges)).toBeNull();
  });
});
