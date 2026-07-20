import { describe, expect, it } from "vitest";

import { railState, stepPosition, type RailStep } from "@/lib/ceremonySteps";

const STEPS: RailStep[] = [
  { key: "hitPoints", label: "Hit Points" },
  { key: "advancement", label: "Ability Score / Feat" },
  { key: "review", label: "Review" },
];

const KEYS = STEPS.map((s) => s.key);

describe("stepPosition", () => {
  it("finds the index of the named key, falling back to 0 for an unknown key", () => {
    expect(stepPosition(KEYS, "advancement")).toBe(1);
    expect(stepPosition(KEYS, "review")).toBe(2);
    expect(stepPosition(KEYS, "gone")).toBe(0);
    expect(stepPosition([], "hitPoints")).toBe(0);
  });
});

describe("railState", () => {
  it("marks keys before the current done, the current active, the rest pending", () => {
    expect(railState(KEYS, "advancement")).toEqual(["done", "active", "pending"]);
    expect(railState(KEYS, "hitPoints")).toEqual(["active", "pending", "pending"]);
    expect(railState(KEYS, "review")).toEqual(["done", "done", "active"]);
  });

  it("falls back to the first key when the current key is unknown", () => {
    expect(railState(KEYS, "gone")).toEqual(["active", "pending", "pending"]);
  });
});
