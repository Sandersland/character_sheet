// deriveSpellCastCost (epic #1827 Slice 1, #1828): the pure classification a
// served spell entry's castCost field feeds. Pure function, no DB.

import { describe, expect, it } from "vitest";

import { deriveSpellCastCost } from "@/lib/spellcasting/cast-cost.js";

describe("deriveSpellCastCost", () => {
  it("classifies a plain action", () => {
    expect(deriveSpellCastCost("1 action")).toBe("action");
  });

  it("classifies a bonus action", () => {
    expect(deriveSpellCastCost("1 bonus action")).toBe("bonusAction");
  });

  it("classifies a reaction, including its trailing trigger clause", () => {
    expect(deriveSpellCastCost("1 reaction, which you take when you are hit")).toBe("reaction");
  });

  it("classifies a plain reaction with no trigger clause", () => {
    expect(deriveSpellCastCost("1 reaction")).toBe("reaction");
  });

  it("classifies an action-or-ritual casting time as action (the combat-relevant half)", () => {
    expect(deriveSpellCastCost("1 action or 8 hours")).toBe("action");
  });

  it("classifies a minutes/hours ritual casting time as other — untracked by the turn economy", () => {
    expect(deriveSpellCastCost("1 minute")).toBe("other");
    expect(deriveSpellCastCost("10 minutes")).toBe("other");
    expect(deriveSpellCastCost("1 hour")).toBe("other");
    expect(deriveSpellCastCost("8 hours")).toBe("other");
  });

  it("is case-insensitive", () => {
    expect(deriveSpellCastCost("1 BONUS ACTION")).toBe("bonusAction");
  });
});
