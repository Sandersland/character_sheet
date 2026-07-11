import { describe, expect, it } from "vitest";

import {
  InvalidExperienceOperationError,
  resolveXpChange,
  xpEventSummary,
} from "@/lib/leveling/experience-ops.js";

// Pure-logic oracle for the XP op summary/resolution helpers — pins the
// byte-identical timeline strings + clamp/validation rules the transaction
// handler depends on (extracted from applyExperienceOperations).

describe("resolveXpChange", () => {
  it("award adds a signed delta and clamps the total at 0", () => {
    expect(resolveXpChange({ type: "award", amount: 450 }, 900)).toEqual({
      newXp: 1350,
      eventType: "xpAward",
    });
    expect(resolveXpChange({ type: "award", amount: -300 }, 1000)).toEqual({
      newXp: 700,
      eventType: "xpAward",
    });
    // Deducting past 0 floors the total, never goes negative.
    expect(resolveXpChange({ type: "award", amount: -5000 }, 1000)).toEqual({
      newXp: 0,
      eventType: "xpAward",
    });
  });

  it("set takes an exact non-negative value", () => {
    expect(resolveXpChange({ type: "set", value: 23000 }, 100)).toEqual({
      newXp: 23000,
      eventType: "xpSet",
    });
  });

  it("set rejects a negative value", () => {
    expect(() => resolveXpChange({ type: "set", value: -1 }, 100)).toThrow(
      InvalidExperienceOperationError,
    );
  });
});

describe("xpEventSummary", () => {
  it("formats a positive award with thousands separators + arrow", () => {
    expect(xpEventSummary("xpAward", 900, 1350)).toBe("Awarded 450 XP (900 → 1,350)");
  });

  it("formats a negative award as a deduction with the absolute delta", () => {
    expect(xpEventSummary("xpAward", 1000, 700)).toBe("Deducted 300 XP (1,000 → 700)");
  });

  it("formats a set as an absolute value with the prior total", () => {
    expect(xpEventSummary("xpSet", 100, 23000)).toBe("XP set to 23,000 (was 100)");
  });
});
