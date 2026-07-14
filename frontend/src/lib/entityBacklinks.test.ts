import { describe, it, expect } from "vitest";

import { chronicleGroups, splitChronicle } from "@/lib/entityBacklinks";
import type { EntityBacklink } from "@/types/character";

function link(overrides: {
  id: string;
  sessionId?: string | null;
  sessionTitle?: string | null;
  sessionOrdinal?: number | null;
  date?: string;
  identity?: { id: string; name: string };
}): EntityBacklink {
  return {
    entry: {
      id: overrides.id,
      characterId: "char-1",
      sessionId: overrides.sessionId ?? null,
      sessionTitle: overrides.sessionTitle ?? null,
      sessionOrdinal: overrides.sessionOrdinal ?? null,
      kind: "NOTE",
      title: null,
      date: overrides.date ?? "2026-06-22T00:00:00.000Z",
      loggedAt: "2026-06-22T00:00:00.000Z",
      body: "body",
    },
    characterName: "Thorne",
    identity: overrides.identity ?? { id: "ent-1", name: "Goblin Chief" },
  };
}

describe("chronicleGroups", () => {
  it("returns no groups for an empty list", () => {
    expect(chronicleGroups([])).toEqual([]);
  });

  it("groups by session id preserving the API's newest-first order", () => {
    const groups = chronicleGroups([
      link({ id: "a", sessionId: "s2" }),
      link({ id: "b", sessionId: "s1" }),
      link({ id: "c", sessionId: "s2" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["s2", "s1"]);
    expect(groups[0].items.map((l) => l.entry.id)).toEqual(["a", "c"]);
    expect(groups[1].items.map((l) => l.entry.id)).toEqual(["b"]);
  });

  it("carries the session ordinal and title onto the group", () => {
    const groups = chronicleGroups([
      link({ id: "a", sessionId: "s2", sessionTitle: "The Dragon Hatchery", sessionOrdinal: 12 }),
    ]);
    expect(groups[0]).toMatchObject({
      sessionId: "s2",
      sessionTitle: "The Dragon Hatchery",
      sessionOrdinal: 12,
    });
  });

  it("collects null-session entries under an 'Outside a session' none group", () => {
    const groups = chronicleGroups([
      link({ id: "a", sessionId: "s1" }),
      link({ id: "b", sessionId: null }),
    ]);
    expect(groups[1]).toMatchObject({ key: "none", sessionId: null, sessionOrdinal: null });
    expect(groups[1].items.map((l) => l.entry.id)).toEqual(["b"]);
  });

  it("derives the group date from its first (newest) item", () => {
    const groups = chronicleGroups([
      link({ id: "a", sessionId: "s1", date: "2026-07-08T00:00:00.000Z" }),
      link({ id: "b", sessionId: "s1", date: "2026-07-01T00:00:00.000Z" }),
    ]);
    expect(groups[0].date).toBe("2026-07-08T00:00:00.000Z");
  });
});

describe("splitChronicle", () => {
  const groups = (n: number) =>
    chronicleGroups(
      Array.from({ length: n }, (_, i) => link({ id: `e${i}`, sessionId: `s${i}` })),
    );

  it("keeps everything visible at or under the cap", () => {
    const { visible, hidden } = splitChronicle(groups(3));
    expect(visible).toHaveLength(3);
    expect(hidden).toHaveLength(0);
  });

  it("hides groups past the cap, preserving order", () => {
    const { visible, hidden } = splitChronicle(groups(5));
    expect(visible.map((g) => g.key)).toEqual(["s0", "s1", "s2"]);
    expect(hidden.map((g) => g.key)).toEqual(["s3", "s4"]);
  });

  it("honors a custom visibleCount", () => {
    const { visible, hidden } = splitChronicle(groups(3), 1);
    expect(visible).toHaveLength(1);
    expect(hidden).toHaveLength(2);
  });
});
