import { describe, expect, it } from "vitest";

import { levelUpPageState } from "@/lib/levelUpPageState";
import type { Character } from "@/types/character";

describe("levelUpPageState", () => {
  it("maps undefined → loading and null → not-found", () => {
    expect(levelUpPageState(undefined)).toEqual({ kind: "loading" });
    expect(levelUpPageState(null)).toEqual({ kind: "not-found" });
  });

  it("maps zero pending level-ups → no-pending", () => {
    const character = { id: "c1", pendingLevelUps: 0 } as unknown as Character;
    expect(levelUpPageState(character)).toEqual({ kind: "no-pending" });
  });

  it("maps a pending level-up → ready, carrying the character", () => {
    const character = { id: "c1", pendingLevelUps: 2 } as unknown as Character;
    expect(levelUpPageState(character)).toEqual({ kind: "ready", character });
  });
});
