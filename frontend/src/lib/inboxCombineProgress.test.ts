import { describe, it, expect } from "vitest";

import { deriveCombineProgress } from "@/lib/inboxCombineProgress";
import type { InboxDuplicateEntity } from "@/types/character";

const ENTITIES: InboxDuplicateEntity[] = [
  { id: "e1", name: "Lil", type: "NPC", visibility: "REVEALED", mentionCount: 1 },
  { id: "e2", name: "lili", type: "NPC", visibility: "REVEALED", mentionCount: 0 },
  { id: "e3", name: "Lili", type: "NPC", visibility: "REVEALED", mentionCount: 3 },
];

describe("deriveCombineProgress", () => {
  it("before any attempt: every non-survivor is remaining, nothing landed, unlocked", () => {
    const progress = deriveCombineProgress(ENTITIES, "e3", []);
    expect(progress.remainingLoserIds).toEqual(["e1", "e2"]);
    expect(progress.landedIds.size).toBe(0);
    expect(progress.survivorLocked).toBe(false);
    expect(progress.failedEntity).toBeUndefined();
  });

  it("after a partial failure: the landed loser drops out of remaining, the survivor locks, and the failed entity is named", () => {
    const progress = deriveCombineProgress(ENTITIES, "e3", [
      { entityId: "e1", ok: true },
      { entityId: "e2", ok: false, error: "Both entities are linked to an item" },
    ]);
    expect(progress.remainingLoserIds).toEqual(["e2"]);
    expect(progress.landedIds).toEqual(new Set(["e1"]));
    expect(progress.survivorLocked).toBe(true);
    expect(progress.failedEntity?.name).toBe("lili");
    expect(progress.failedError).toBe("Both entities are linked to an item");
  });

  it("after full success: nothing remains", () => {
    const progress = deriveCombineProgress(ENTITIES, "e3", [
      { entityId: "e1", ok: true },
      { entityId: "e2", ok: true },
    ]);
    expect(progress.remainingLoserIds).toEqual([]);
    expect(progress.survivorLocked).toBe(true);
  });
});
