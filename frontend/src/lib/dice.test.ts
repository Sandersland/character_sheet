import { afterEach, describe, expect, it, vi } from "vitest";

import { formatRollSpec, rollDie, rollSpec } from "./dice";

describe("rollDie", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays within 1..faces across many rolls", () => {
    for (let i = 0; i < 200; i++) {
      const value = rollDie(20);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(20);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("maps a mocked Math.random to the expected face", () => {
    vi.spyOn(Math, "random").mockReturnValue((5 - 1) / 8);
    expect(rollDie(8)).toBe(5);
  });
});

describe("rollSpec", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stays within count..count*faces (plus modifier) across many rolls", () => {
    const spec = { count: 4, faces: 6, dropLowest: 1, modifier: 2 };
    for (let i = 0; i < 200; i++) {
      const result = rollSpec(spec);
      expect(result.total).toBeGreaterThanOrEqual(3 + 2);
      expect(result.total).toBeLessThanOrEqual(18 + 2);
      expect(result.dice).toHaveLength(4);
      expect(result.dice.filter((die) => die.dropped)).toHaveLength(1);
    }
  });

  it("drops exactly the lowest die and excludes it from the total (4d6 drop lowest)", () => {
    // dice rolled in order: 2, 5, 6, 1 — the trailing 1 is the lowest.
    const sequence = [(2 - 1) / 6, (5 - 1) / 6, (6 - 1) / 6, (1 - 1) / 6];
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => sequence[call++]);

    const result = rollSpec({ count: 4, faces: 6, dropLowest: 1 });

    expect(result.dice).toEqual([
      { value: 2, dropped: false },
      { value: 5, dropped: false },
      { value: 6, dropped: false },
      { value: 1, dropped: true },
    ]);
    expect(result.total).toBe(13);
    expect(result.modifier).toBe(0);
  });

  it("drops exactly `dropLowest` dice when more than one is dropped, ties included", () => {
    // dice rolled in order: 6, 1, 4, 2 — drop the two lowest (1 and 2).
    const sequence = [(6 - 1) / 6, (1 - 1) / 6, (4 - 1) / 6, (2 - 1) / 6];
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => sequence[call++]);

    const result = rollSpec({ count: 4, faces: 6, dropLowest: 2 });

    expect(result.dice.filter((die) => die.dropped)).toHaveLength(2);
    expect(result.dice.filter((die) => die.dropped).map((die) => die.value).sort()).toEqual([1, 2]);
    expect(result.total).toBe(10); // 6 + 4, the two non-dropped dice
  });

  it("adds the modifier to the total without affecting individual dice", () => {
    vi.spyOn(Math, "random").mockReturnValue((5 - 1) / 8);

    const result = rollSpec({ count: 1, faces: 8, modifier: 3 });

    expect(result.dice).toEqual([{ value: 5, dropped: false }]);
    expect(result.modifier).toBe(3);
    expect(result.total).toBe(8);
  });

  it("defaults modifier and dropLowest to 0 when omitted", () => {
    vi.spyOn(Math, "random").mockReturnValue((4 - 1) / 6);

    const result = rollSpec({ count: 1, faces: 6 });

    expect(result.dice).toEqual([{ value: 4, dropped: false }]);
    expect(result.total).toBe(4);
  });
});

describe("formatRollSpec", () => {
  it("formats a plain roll", () => {
    expect(formatRollSpec({ count: 1, faces: 20 })).toBe("1d20");
  });

  it("formats a drop-lowest roll", () => {
    expect(formatRollSpec({ count: 4, faces: 6, dropLowest: 1 })).toBe("4d6 drop lowest");
  });

  it("formats dropping more than one die", () => {
    expect(formatRollSpec({ count: 4, faces: 6, dropLowest: 2 })).toBe("4d6 drop lowest 2");
  });

  it("formats a positive modifier", () => {
    expect(formatRollSpec({ count: 1, faces: 8, modifier: 3 })).toBe("1d8 + 3");
  });

  it("formats a negative modifier", () => {
    expect(formatRollSpec({ count: 2, faces: 4, modifier: -1 })).toBe("2d4 - 1");
  });
});
