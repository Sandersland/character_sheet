import { describe, expect, it } from "vitest";

import { addCurrency, formatCurrency, fromCopper, splitLumpSum, toCopper } from "@/lib/currency";
import type { Currency } from "@/types/character";

function sumCurrencies(lines: Currency[]): Currency {
  return lines.reduce(
    (acc, c) => ({
      cp: acc.cp + c.cp,
      sp: acc.sp + c.sp,
      gp: acc.gp + c.gp,
      pp: acc.pp + c.pp,
    }),
    { cp: 0, sp: 0, gp: 0, pp: 0 }
  );
}

describe("toCopper", () => {
  it("weights denominations cp=1, sp=10, gp=100, pp=1000", () => {
    expect(toCopper({ cp: 0, sp: 0, gp: 0, pp: 0 })).toBe(0);
    expect(toCopper({ cp: 7, sp: 0, gp: 0, pp: 0 })).toBe(7);
    expect(toCopper({ cp: 0, sp: 3, gp: 0, pp: 0 })).toBe(30);
    expect(toCopper({ cp: 0, sp: 0, gp: 5, pp: 0 })).toBe(500);
    expect(toCopper({ cp: 0, sp: 0, gp: 0, pp: 2 })).toBe(2000);
    expect(toCopper({ cp: 1, sp: 1, gp: 1, pp: 1 })).toBe(1111);
  });
});

describe("fromCopper", () => {
  it("decomposes greedily pp→gp→sp→cp", () => {
    expect(fromCopper(0)).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 });
    expect(fromCopper(1111)).toEqual({ cp: 1, sp: 1, gp: 1, pp: 1 });
    expect(fromCopper(2347)).toEqual({ cp: 7, sp: 4, gp: 3, pp: 2 });
    expect(fromCopper(9)).toEqual({ cp: 9, sp: 0, gp: 0, pp: 0 });
  });

  it("round-trips with toCopper for arbitrary amounts", () => {
    for (const n of [0, 1, 9, 10, 99, 100, 555, 1000, 1234, 99999]) {
      expect(toCopper(fromCopper(n))).toBe(n);
    }
  });
});

describe("addCurrency", () => {
  it("adds each denomination independently without carrying up", () => {
    // three 15 gp sales stay 45 gp — not normalized to 4 pp 5 gp
    expect(
      addCurrency(addCurrency({ cp: 0, sp: 0, gp: 15, pp: 0 }, { cp: 0, sp: 0, gp: 15, pp: 0 }), {
        cp: 0,
        sp: 0,
        gp: 15,
        pp: 0,
      })
    ).toEqual({ cp: 0, sp: 0, gp: 45, pp: 0 });
  });

  it("sums mixed denominations field-wise", () => {
    expect(
      addCurrency({ cp: 4, sp: 3, gp: 2, pp: 1 }, { cp: 1, sp: 2, gp: 3, pp: 4 })
    ).toEqual({ cp: 5, sp: 5, gp: 5, pp: 5 });
  });
});

describe("formatCurrency", () => {
  it("renders a single nonzero denomination", () => {
    expect(formatCurrency({ cp: 0, sp: 0, gp: 45, pp: 0 })).toBe("45 gp");
    expect(formatCurrency({ cp: 7, sp: 0, gp: 0, pp: 0 })).toBe("7 cp");
  });

  it("joins multiple nonzero denominations largest-first", () => {
    expect(formatCurrency({ cp: 0, sp: 0, gp: 2, pp: 1 })).toBe("1 pp 2 gp");
    expect(formatCurrency({ cp: 4, sp: 3, gp: 2, pp: 1 })).toBe("1 pp 2 gp 3 sp 4 cp");
  });

  it("renders an all-zero amount as '0 gp'", () => {
    expect(formatCurrency({ cp: 0, sp: 0, gp: 0, pp: 0 })).toBe("0 gp");
  });
});

describe("splitLumpSum", () => {
  it("returns [total] decomposed when n = 1", () => {
    const total: Currency = { cp: 1, sp: 2, gp: 3, pp: 4 };
    const lines = splitLumpSum(total, 1);
    expect(lines).toHaveLength(1);
    expect(toCopper(lines[0])).toBe(toCopper(total));
    // decomposed form is canonical
    expect(lines[0]).toEqual(fromCopper(toCopper(total)));
  });

  it("splits so the lines sum EXACTLY to the total (copper invariant)", () => {
    const total: Currency = { cp: 0, sp: 0, gp: 10, pp: 0 }; // 1000 cp
    for (const n of [2, 3, 4, 7, 9]) {
      const lines = splitLumpSum(total, n);
      expect(lines).toHaveLength(n);
      expect(toCopper(sumCurrencies(lines))).toBe(toCopper(total));
    }
  });

  it("distributes the remainder copper to the earliest lines", () => {
    // 1000 cp across 3 → base 333, remainder 1 → first line 334, rest 333
    const lines = splitLumpSum({ cp: 0, sp: 0, gp: 10, pp: 0 }, 3);
    expect(toCopper(lines[0])).toBe(334);
    expect(toCopper(lines[1])).toBe(333);
    expect(toCopper(lines[2])).toBe(333);
  });

  it("hands every extra copper to the earliest lines, never overflowing the count", () => {
    // 1003 cp across 4 → base 250, remainder 3 → 251, 251, 251, 250
    const total = fromCopper(1003);
    const lines = splitLumpSum(total, 4);
    expect(lines.map(toCopper)).toEqual([251, 251, 251, 250]);
    expect(toCopper(sumCurrencies(lines))).toBe(1003);
  });

  it("each line is a canonical greedy decomposition", () => {
    const lines = splitLumpSum({ cp: 0, sp: 0, gp: 0, pp: 1 }, 3); // 1000 cp
    for (const line of lines) {
      expect(line).toEqual(fromCopper(toCopper(line)));
    }
  });
});
