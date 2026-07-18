import { describe, expect, it } from "vitest";

import { clampChoicesToCaps } from "../resources.js";
import type { ChoiceEntry } from "../resources.js";

const pick = (id: string): ChoiceEntry => ({ id, name: id, description: "" });

describe("clampChoicesToCaps", () => {
  it("slices each key to its cap (LIFO keep-oldest) and counts removals", () => {
    const choices = { huntersPrey: [pick("a"), pick("b"), pick("c")] };
    const { clamped, removedCount } = clampChoicesToCaps(choices, new Map([["huntersPrey", 2]]));
    expect(clamped.huntersPrey.map((c) => c.id)).toEqual(["a", "b"]);
    expect(removedCount).toBe(1);
  });

  it("omits keys with cap 0 (subclass/tier no longer grants them)", () => {
    const choices = { gone: [pick("x"), pick("y")], kept: [pick("z")] };
    const { clamped, removedCount } = clampChoicesToCaps(choices, new Map([["kept", 1]]));
    expect(Object.keys(clamped)).toEqual(["kept"]);
    expect(clamped.kept.map((c) => c.id)).toEqual(["z"]);
    expect(removedCount).toBe(2); // both "gone" entries dropped
  });

  it("keeps under-cap lists intact with no removals", () => {
    const choices = { a: [pick("1")] };
    const { clamped, removedCount } = clampChoicesToCaps(choices, new Map([["a", 3]]));
    expect(clamped.a.map((c) => c.id)).toEqual(["1"]);
    expect(removedCount).toBe(0);
  });

  it("does not mutate the input", () => {
    const choices = { a: [pick("1"), pick("2")] };
    clampChoicesToCaps(choices, new Map([["a", 1]]));
    expect(choices.a).toHaveLength(2);
  });
});
