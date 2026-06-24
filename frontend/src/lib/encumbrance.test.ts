import { describe, expect, it } from "vitest";

import { carryingCapacity } from "./encumbrance";

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
