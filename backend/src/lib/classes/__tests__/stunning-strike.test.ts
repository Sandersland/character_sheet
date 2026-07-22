import { describe, expect, it } from "vitest";

import { canAttemptStunningStrike, resolveStunningStrikeOutcome } from "@/lib/classes/stunning-strike.js";
import { focusSaveDC } from "@/lib/classes/monk.js";

describe("focusSaveDC (SRD 5.2: 8 + prof + Wis)", () => {
  it("computes 8 + proficiency + Wisdom modifier", () => {
    // Wis 16 → +3 mod, prof +3 (level 5-8) → 8 + 3 + 3 = 14.
    expect(focusSaveDC({ wisdom: 16 }, 3)).toBe(14);
  });

  it("defaults Wisdom to 10 (+0 mod) when absent", () => {
    expect(focusSaveDC({}, 3)).toBe(11);
  });

  it("scales with a higher proficiency bonus", () => {
    // Wis 20 → +5 mod, prof +6 (level 17-20) → 8 + 6 + 5 = 19.
    expect(focusSaveDC({ wisdom: 20 }, 6)).toBe(19);
  });
});

describe("canAttemptStunningStrike (once-per-turn guard)", () => {
  it("allows a first attempt this turn", () => {
    expect(canAttemptStunningStrike({ usedThisTurn: false })).toBe(true);
  });

  it("blocks a second attempt in the same turn", () => {
    expect(canAttemptStunningStrike({ usedThisTurn: true })).toBe(false);
  });
});

describe("resolveStunningStrikeOutcome (Con save vs focus DC)", () => {
  it("is a fail (Stunned) when the roll is below the DC", () => {
    expect(resolveStunningStrikeOutcome(10, 14)).toBe("fail");
  });

  it("is a success (half-speed + advantage) when the roll meets the DC", () => {
    expect(resolveStunningStrikeOutcome(14, 14)).toBe("success");
  });

  it("is a success when the roll exceeds the DC", () => {
    expect(resolveStunningStrikeOutcome(20, 14)).toBe("success");
  });
});
