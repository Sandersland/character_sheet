import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatRollBreakdown,
  formatRollSpec,
  rollDie,
  rollSpec,
  summarizeRoll,
  usesAdvantage,
} from "./dice";

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

describe("summarizeRoll", () => {
  it("drops exactly the lowest value and excludes it from the total (4d6 drop lowest)", () => {
    const result = summarizeRoll([2, 5, 6, 1], { count: 4, faces: 6, dropLowest: 1 });

    expect(result.dice).toEqual([
      { value: 2, dropped: false },
      { value: 5, dropped: false },
      { value: 6, dropped: false },
      { value: 1, dropped: true },
    ]);
    expect(result.total).toBe(13);
    expect(result.modifier).toBe(0);
  });

  it("adds the modifier to the total without affecting individual dice", () => {
    const result = summarizeRoll([5], { count: 1, faces: 8, modifier: 3 });

    expect(result.dice).toEqual([{ value: 5, dropped: false }]);
    expect(result.modifier).toBe(3);
    expect(result.total).toBe(8);
  });

  it("defaults modifier and dropLowest to 0 when omitted", () => {
    const result = summarizeRoll([4], { count: 1, faces: 6 });

    expect(result.dice).toEqual([{ value: 4, dropped: false }]);
    expect(result.total).toBe(4);
  });

  it("agrees with rollSpec when given the same underlying values", () => {
    const sequence = [(6 - 1) / 6, (1 - 1) / 6, (4 - 1) / 6, (2 - 1) / 6];
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => sequence[call++]);

    const spec = { count: 4, faces: 6, dropLowest: 2 };
    const fromEngine = rollSpec(spec);
    const fromObservedValues = summarizeRoll([6, 1, 4, 2], spec);

    expect(fromObservedValues).toEqual(fromEngine);

    vi.restoreAllMocks();
  });
});

describe("advantage / disadvantage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("advantage rolls two d20s and keeps the higher, flagging the lower dropped", () => {
    // dice rolled in order: 7, 18 — advantage keeps 18.
    const sequence = [(7 - 1) / 20, (18 - 1) / 20];
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => sequence[call++]);

    const result = rollSpec({ count: 1, faces: 20, modifier: 5, mode: "advantage" });

    expect(result.dice).toEqual([
      { value: 7, dropped: true },
      { value: 18, dropped: false },
    ]);
    expect(result.total).toBe(23); // 18 + 5
  });

  it("disadvantage rolls two d20s and keeps the lower, flagging the higher dropped", () => {
    const sequence = [(7 - 1) / 20, (18 - 1) / 20];
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => sequence[call++]);

    const result = rollSpec({ count: 1, faces: 20, modifier: 5, mode: "disadvantage" });

    expect(result.dice).toEqual([
      { value: 7, dropped: false },
      { value: 18, dropped: true },
    ]);
    expect(result.total).toBe(12); // 7 + 5
  });

  it("keeps exactly one die on a tie (both natural values equal)", () => {
    const sequence = [(11 - 1) / 20, (11 - 1) / 20];
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => sequence[call++]);

    const result = rollSpec({ count: 1, faces: 20, mode: "advantage" });

    expect(result.dice.filter((d) => !d.dropped)).toHaveLength(1);
    expect(result.dice.filter((d) => d.dropped)).toHaveLength(1);
    expect(result.total).toBe(11);
  });

  it("mode: normal is unchanged — a single d20", () => {
    vi.spyOn(Math, "random").mockReturnValue((14 - 1) / 20);

    const result = rollSpec({ count: 1, faces: 20, modifier: 2, mode: "normal" });

    expect(result.dice).toEqual([{ value: 14, dropped: false }]);
    expect(result.total).toBe(16);
  });

  it("no-ops advantage on a multi-die damage spec (2d6 stays two dice)", () => {
    const result = rollSpec({ count: 2, faces: 6, mode: "advantage" });
    expect(result.dice).toHaveLength(2);
    expect(result.dice.filter((d) => d.dropped)).toHaveLength(0);
  });

  it("no-ops advantage on a non-d20 single die (1d8 stays one die)", () => {
    const result = rollSpec({ count: 1, faces: 8, mode: "advantage" });
    expect(result.dice).toHaveLength(1);
    expect(result.dice[0].dropped).toBe(false);
  });

  it("summarizeRoll applies advantage drop logic to externally-observed values", () => {
    const result = summarizeRoll([12, 3], { count: 1, faces: 20, mode: "disadvantage" });
    expect(result.dice).toEqual([
      { value: 12, dropped: true },
      { value: 3, dropped: false },
    ]);
    expect(result.total).toBe(3);
  });

  it("usesAdvantage guards on mode + single d20 only", () => {
    expect(usesAdvantage({ count: 1, faces: 20, mode: "advantage" })).toBe(true);
    expect(usesAdvantage({ count: 1, faces: 20, mode: "disadvantage" })).toBe(true);
    expect(usesAdvantage({ count: 1, faces: 20, mode: "normal" })).toBe(false);
    expect(usesAdvantage({ count: 1, faces: 20 })).toBe(false);
    expect(usesAdvantage({ count: 2, faces: 20, mode: "advantage" })).toBe(false);
    expect(usesAdvantage({ count: 1, faces: 6, mode: "advantage" })).toBe(false);
  });

  it("formats a mode suffix on the spec label", () => {
    expect(formatRollSpec({ count: 1, faces: 20, modifier: 5, mode: "advantage" })).toBe(
      "1d20 + 5 (advantage)",
    );
    expect(formatRollSpec({ count: 1, faces: 20, mode: "disadvantage" })).toBe(
      "1d20 (disadvantage)",
    );
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

describe("formatRollBreakdown", () => {
  it("injects a single die face after the dice token", () => {
    expect(formatRollBreakdown("1d20 + 5", [12])).toBe("1d20 (12) + 5");
  });

  it("injects multiple comma-separated faces", () => {
    expect(formatRollBreakdown("2d6", [3, 5])).toBe("2d6 (3, 5)");
  });

  it("preserves a negative modifier tail unchanged", () => {
    expect(formatRollBreakdown("1d8 - 1", [4])).toBe("1d8 (4) - 1");
  });

  it("returns the label untouched when faces is empty", () => {
    expect(formatRollBreakdown("1d20 + 5", [])).toBe("1d20 + 5");
  });
});
