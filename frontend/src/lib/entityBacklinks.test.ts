import { describe, it, expect } from "vitest";

import { groupBySession, groupByIdentity } from "@/lib/entityBacklinks";
import type { EntityBacklink } from "@/types/character";

function link(overrides: {
  id: string;
  sessionId?: string | null;
  identity?: { id: string; name: string };
}): EntityBacklink {
  return {
    entry: {
      id: overrides.id,
      characterId: "char-1",
      sessionId: overrides.sessionId ?? null,
      kind: "NOTE",
      title: null,
      date: "2026-06-22T00:00:00.000Z",
      loggedAt: "2026-06-22T00:00:00.000Z",
      body: "body",
    },
    characterName: "Thorne",
    identity: overrides.identity ?? { id: "ent-1", name: "Goblin Chief" },
  };
}

describe("groupBySession", () => {
  it("returns no groups for an empty list", () => {
    expect(groupBySession([])).toEqual([]);
  });

  it("collects a null sessionId under the 'none' key", () => {
    const groups = groupBySession([link({ id: "a", sessionId: null })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("none");
    expect(groups[0].items).toHaveLength(1);
  });

  it("groups entries by session id preserving encounter order", () => {
    const groups = groupBySession([
      link({ id: "a", sessionId: "s2" }),
      link({ id: "b", sessionId: "s1" }),
      link({ id: "c", sessionId: "s2" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["s2", "s1"]);
    expect(groups[0].items.map((l) => l.entry.id)).toEqual(["a", "c"]);
    expect(groups[1].items.map((l) => l.entry.id)).toEqual(["b"]);
  });
});

describe("groupByIdentity", () => {
  it("returns no groups for an empty list", () => {
    expect(groupByIdentity([])).toEqual([]);
  });

  it("groups by identity id in first-seen order and carries the name", () => {
    const groups = groupByIdentity([
      link({ id: "a", identity: { id: "e2", name: "Vecna" } }),
      link({ id: "b", identity: { id: "e1", name: "Jenkins" } }),
      link({ id: "c", identity: { id: "e2", name: "Vecna" } }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["e2", "e1"]);
    expect(groups[0]).toMatchObject({ id: "e2", name: "Vecna" });
    expect(groups[0].items.map((l) => l.entry.id)).toEqual(["a", "c"]);
    expect(groups[1].items.map((l) => l.entry.id)).toEqual(["b"]);
  });
});
