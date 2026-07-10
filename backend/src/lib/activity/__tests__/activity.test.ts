import { describe, expect, it } from "vitest";

import { buildActivityQuery, serializeActivityEvent } from "@/lib/activity/activity.js";

type ActivityEventRow = Parameters<typeof serializeActivityEvent>[0];

describe("buildActivityQuery", () => {
  it("scopes to the character with no other filters by default", () => {
    expect(buildActivityQuery("char-1", {})).toEqual({
      where: { characterId: "char-1" },
      orderBy: { createdAt: "desc" },
      include: undefined,
    });
  });

  it("applies a valid category filter", () => {
    expect(buildActivityQuery("char-1", { category: "hitPoints" })).toEqual({
      where: { characterId: "char-1", category: "hitPoints" },
      orderBy: { createdAt: "desc" },
      include: undefined,
    });
  });

  it("silently ignores an unknown category rather than 400ing", () => {
    expect(buildActivityQuery("char-1", { category: "notARealCategory" })).toEqual({
      where: { characterId: "char-1" },
      orderBy: { createdAt: "desc" },
      include: undefined,
    });
  });

  it("applies a valid type filter", () => {
    expect(buildActivityQuery("char-1", { type: "damage" })).toEqual({
      where: { characterId: "char-1", type: "damage" },
      orderBy: { createdAt: "desc" },
      include: undefined,
    });
  });

  it("threads sessionId and entityId straight through", () => {
    expect(
      buildActivityQuery("char-1", { sessionId: "sess-1", entityId: "item-1" }),
    ).toEqual({
      where: { characterId: "char-1", sessionId: "sess-1", entityId: "item-1" },
      orderBy: { createdAt: "desc" },
      include: undefined,
    });
  });

  it("maps reverted=0/1 to a boolean filter, and anything else to no filter", () => {
    expect(buildActivityQuery("char-1", { reverted: "0" }).where).toMatchObject({
      reverted: false,
    });
    expect(buildActivityQuery("char-1", { reverted: "1" }).where).toMatchObject({
      reverted: true,
    });
    expect(buildActivityQuery("char-1", { reverted: "bogus" }).where).not.toHaveProperty(
      "reverted",
    );
  });

  it("includes fields only when includeFields=1", () => {
    expect(buildActivityQuery("char-1", { includeFields: "1" }).include).toEqual({
      fields: true,
    });
    expect(buildActivityQuery("char-1", { includeFields: "0" }).include).toBeUndefined();
  });
});

describe("serializeActivityEvent", () => {
  const baseRow = {
    id: "evt-1",
    characterId: "char-1",
    category: "hitPoints",
    type: "damage",
    summary: "Took 5 damage",
    entityType: null,
    entityId: null,
    before: { hitPoints: { current: 15 } },
    after: { hitPoints: { current: 10 } },
    data: null,
    actor: "player",
    reverted: false,
    batchId: "batch-1",
    sessionId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("maps nullable relation fields to undefined and passes the rest through", () => {
    expect(serializeActivityEvent(baseRow as ActivityEventRow)).toEqual({
      id: "evt-1",
      category: "hitPoints",
      type: "damage",
      summary: "Took 5 damage",
      entityType: undefined,
      entityId: undefined,
      before: { hitPoints: { current: 15 } },
      after: { hitPoints: { current: 10 } },
      data: undefined,
      actor: "player",
      reverted: false,
      batchId: "batch-1",
      createdAt: baseRow.createdAt,
      fields: undefined,
    });
  });

  it("maps included field diffs, defaulting nullable old/new values to undefined", () => {
    const row = {
      ...baseRow,
      fields: [
        { id: "f1", path: "hitPoints.current", oldValue: 15, newValue: 10 },
        { id: "f2", path: "hitPoints.max", oldValue: null, newValue: null },
      ],
    };
    expect(serializeActivityEvent(row as ActivityEventRow).fields).toEqual([
      { id: "f1", path: "hitPoints.current", oldValue: 15, newValue: 10 },
      { id: "f2", path: "hitPoints.max", oldValue: undefined, newValue: undefined },
    ]);
  });
});
