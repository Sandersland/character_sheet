import { describe, expect, it } from "vitest";

import { currencyAdjustSummary } from "@/routes/character/characters.js";

// Pure-logic oracle for the currencyAdjust timeline summary (extracted from the
// PATCH /characters/:id handler) — pins the byte-identical delta string.

describe("currencyAdjustSummary", () => {
  it("lists each changed denomination with a signed delta, pp→cp order", () => {
    expect(
      currencyAdjustSummary(
        { pp: 0, gp: 10, sp: 4, cp: 0 },
        { pp: 1, gp: 15, sp: 2, cp: 0 },
      ),
    ).toBe("Currency adjusted (+1 pp, +5 gp, -2 sp)");
  });

  it("omits unchanged denominations", () => {
    expect(
      currencyAdjustSummary({ pp: 0, gp: 10, sp: 0, cp: 0 }, { pp: 0, gp: 50, sp: 0, cp: 0 }),
    ).toBe("Currency adjusted (+40 gp)");
  });

  it("treats missing denominations as zero", () => {
    expect(currencyAdjustSummary({}, { gp: 5 })).toBe("Currency adjusted (+5 gp)");
  });

  it("falls back to a bare label when nothing changed", () => {
    expect(
      currencyAdjustSummary({ pp: 1, gp: 2, sp: 3, cp: 4 }, { pp: 1, gp: 2, sp: 3, cp: 4 }),
    ).toBe("Currency adjusted");
  });
});
