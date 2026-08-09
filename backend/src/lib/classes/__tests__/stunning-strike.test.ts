import { describe, expect, it } from "vitest";

import {
  STUNNING_STRIKE_LEVEL,
  canAttemptStunningStrike,
  hasStunningStrike,
  resolveStunningStrikeOutcome,
  stunningStrikeSummary,
} from "@/lib/classes/stunning-strike.js";
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

// #1337: hasStunningStrike is the single source of the L5 gate — both
// character-serialize.ts's stunningStrikeRider and this module's own cast
// guard import it. No numeric literal for the gate appears here; the
// boundary is derived from STUNNING_STRIKE_LEVEL itself, so mutating that one
// constant would flip both this assertion and the rider/guard together.
describe("hasStunningStrike (#1337 shared gate)", () => {
  it("is false one level below the gate", () => {
    expect(hasStunningStrike(STUNNING_STRIKE_LEVEL - 1)).toBe(false);
  });

  it("is true exactly at the gate", () => {
    expect(hasStunningStrike(STUNNING_STRIKE_LEVEL)).toBe(true);
  });

  it("is true above the gate", () => {
    expect(hasStunningStrike(STUNNING_STRIKE_LEVEL + 5)).toBe(true);
  });
});

describe("canAttemptStunningStrike (2024: once-per-turn guard; 2014: no cap, #1500)", () => {
  it("2024: allows a first attempt this turn", () => {
    expect(canAttemptStunningStrike({ usedThisTurn: false }, "EDITION_2024")).toBe(true);
  });

  it("2024: blocks a second attempt in the same turn", () => {
    expect(canAttemptStunningStrike({ usedThisTurn: true }, "EDITION_2024")).toBe(false);
  });

  it("2014: allows a first attempt this turn", () => {
    expect(canAttemptStunningStrike({ usedThisTurn: false }, "EDITION_2014")).toBe(true);
  });

  it("2014: allows a SECOND attempt in the same turn — SRD 5.1 has no once-per-turn cap", () => {
    expect(canAttemptStunningStrike({ usedThisTurn: true }, "EDITION_2014")).toBe(true);
  });
});

describe("resolveStunningStrikeOutcome (Con save vs ki/focus save DC — edition-invariant outcome logic)", () => {
  it("is a fail (Stunned) when the roll is below the DC", () => {
    expect(resolveStunningStrikeOutcome(10, 14)).toBe("fail");
  });

  it("is a success when the roll meets the DC", () => {
    expect(resolveStunningStrikeOutcome(14, 14)).toBe("success");
  });

  it("is a success when the roll exceeds the DC", () => {
    expect(resolveStunningStrikeOutcome(20, 14)).toBe("success");
  });
});

describe("stunningStrikeSummary (#1500 — 2014 has no success rider and a different fail-duration wording)", () => {
  it("2024 fail: Stunned until the START of the monk's next turn", () => {
    expect(stunningStrikeSummary(14, 10, "fail", "EDITION_2024")).toBe(
      "Stunning Strike — DC 14, target rolled 10: failed the save — Stunned until the start of your next turn.",
    );
  });

  it("2024 success: half-speed + advantage rider", () => {
    expect(stunningStrikeSummary(14, 14, "success", "EDITION_2024")).toBe(
      "Stunning Strike — DC 14, target rolled 14: made the save — its speed is halved until the start of your next turn, and the next attack roll against it before then has advantage.",
    );
  });

  it("2014 fail: Stunned until the END of the monk's next turn (not the start)", () => {
    expect(stunningStrikeSummary(14, 10, "fail", "EDITION_2014")).toBe(
      "Stunning Strike — DC 14, target rolled 10: failed the save — Stunned until the end of your next turn.",
    );
  });

  it("2014 success: no rider at all", () => {
    expect(stunningStrikeSummary(14, 14, "success", "EDITION_2014")).toBe(
      "Stunning Strike — DC 14, target rolled 14: made the save — no effect.",
    );
  });
});
