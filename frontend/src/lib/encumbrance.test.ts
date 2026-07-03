import { describe, expect, it } from "vitest";

import { carryingCapacity, coinWeight } from "./encumbrance";

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
    expect(coinWeight({ cp: 0, sp: 0, gp: 0, pp: 0 })).toBe(0);
  });

  it("weighs 50 coins of any single denomination at 1 lb", () => {
    expect(coinWeight({ cp: 50, sp: 0, gp: 0, pp: 0 })).toBe(1);
    expect(coinWeight({ cp: 0, sp: 0, gp: 50, pp: 0 })).toBe(1);
  });

  it("sums across denominations (50 total coins = 1 lb)", () => {
    expect(coinWeight({ cp: 10, sp: 10, gp: 20, pp: 10 })).toBe(1);
  });

  it("scales fractionally with coin count", () => {
    expect(coinWeight({ cp: 100, sp: 20, gp: 10, pp: 7 })).toBe(2.74);
    expect(coinWeight({ cp: 25, sp: 0, gp: 0, pp: 0 })).toBe(0.5);
  });
});
