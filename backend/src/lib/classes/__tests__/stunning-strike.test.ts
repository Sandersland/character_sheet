import { describe, expect, it } from "vitest";

import { canAttemptStunningStrike, resolveStunningStrikeOutcome } from "@/lib/classes/stunning-strike.js";
import { monkSaveDC, monkPoolKey } from "@/lib/classes/monk.js";

// Renamed for #1499 (the old name cited only the 2024 "Focus" pool). SRD 5.1
// "Ki save DC = 8 + your proficiency bonus + your Wisdom modifier" (PHB'14
// p.78) and SRD 5.2 "Focus save DC = 8 + Wisdom modifier + Proficiency Bonus"
// (PHB'24 p.88) are the identical formula, so this takes no `edition`.
describe("monkSaveDC (SRD 5.1 Ki save DC / SRD 5.2 Focus save DC: 8 + prof + Wis)", () => {
  it("computes 8 + proficiency + Wisdom modifier", () => {
    // Wis 16 → +3 mod, prof +3 (level 5-8) → 8 + 3 + 3 = 14.
    expect(monkSaveDC({ wisdom: 16 }, 3)).toBe(14);
  });

  it("defaults Wisdom to 10 (+0 mod) when absent", () => {
    expect(monkSaveDC({}, 3)).toBe(11);
  });

  it("scales with a higher proficiency bonus", () => {
    // Wis 20 → +5 mod, prof +6 (level 17-20) → 8 + 6 + 5 = 19.
    expect(monkSaveDC({ wisdom: 20 }, 6)).toBe(19);
  });
});

// #1313 D3: the Monk pool's vocabulary by edition — Ki Points (SRD 5.1 /
// PHB'14 p.78) vs Focus Points (SRD 5.2 / PHB'24 p.88). Nothing consumes the
// "ki" branch yet (#1500 wires up the 2014 monk's own pool under this key).
describe("monkPoolKey (#1313 D3)", () => {
  it('is "ki" for EDITION_2014', () => {
    expect(monkPoolKey("EDITION_2014")).toBe("ki");
  });

  it('is "focus" for EDITION_2024', () => {
    expect(monkPoolKey("EDITION_2024")).toBe("focus");
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
