import { describe, expect, it } from "vitest";

import { carriedWeight, carryingCapacity, coinWeight } from "@/lib/srd/encumbrance.js";

const EMPTY_PURSE = { cp: 0, sp: 0, gp: 0, pp: 0 };

describe("carryingCapacity", () => {
  it("is STR × 15", () => {
    expect(carryingCapacity(8)).toBe(120);
    expect(carryingCapacity(10)).toBe(150);
    expect(carryingCapacity(15)).toBe(225);
    expect(carryingCapacity(20)).toBe(300);
  });

  it("recomputes from the given STR (derive-on-read, no persisted value)", () => {
    expect(carryingCapacity(12)).toBe(180);
    expect(carryingCapacity(13)).toBe(195);
  });
});

describe("coinWeight", () => {
  it("is 0 for an empty purse", () => {
    expect(coinWeight(EMPTY_PURSE)).toBe(0);
  });

  it("weighs 50 coins of any single denomination at 1 lb", () => {
    expect(coinWeight({ cp: 50, sp: 0, gp: 0, pp: 0 })).toBe(1);
    expect(coinWeight({ cp: 0, sp: 0, gp: 50, pp: 0 })).toBe(1);
  });

  it("sums across denominations (50 total coins = 1 lb)", () => {
    expect(coinWeight({ cp: 10, sp: 10, gp: 20, pp: 10 })).toBe(1);
  });

  it("scales fractionally with coin count", () => {
    // Pins the exact float; toFixed(1) display would hide drift.
    expect(coinWeight({ cp: 100, sp: 20, gp: 10, pp: 7 })).toBe(2.74);
    expect(coinWeight({ cp: 25, sp: 0, gp: 0, pp: 0 })).toBe(0.5);
  });
});

describe("carriedWeight", () => {
  it("is 0 for an empty pack and an empty purse", () => {
    expect(carriedWeight([], EMPTY_PURSE)).toBe(0);
  });

  it("multiplies each row's weight by its quantity", () => {
    expect(carriedWeight([{ weight: 3, quantity: 4 }], EMPTY_PURSE)).toBe(12);
  });

  it("treats a null or absent weight as weightless rather than skipping the row", () => {
    expect(carriedWeight([{ weight: null, quantity: 2 }, { quantity: 5 }, { weight: 1, quantity: 1 }], EMPTY_PURSE)).toBe(1);
  });

  it("adds the purse to the pack (STR 14 fixture: 30 lb of gear + 100 coins = 32 lb)", () => {
    const items = [{ weight: 10, quantity: 3 }];
    expect(carriedWeight(items, { cp: 40, sp: 30, gp: 20, pp: 10 })).toBe(32);
  });

  it("is the coin weight alone when the pack is empty", () => {
    expect(carriedWeight([], { cp: 0, sp: 0, gp: 500, pp: 0 })).toBe(10);
  });
});
