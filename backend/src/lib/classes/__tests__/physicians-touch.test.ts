import { describe, expect, it } from "vitest";

import { physiciansTouchAugmentor, PHYSICIANS_TOUCH_LEVEL, PHYSICIANS_TOUCH_REMINDER } from "../physicians-touch.js";
import type { AugmentorContext } from "../announce-augmentors.js";
import type { AvailableAction } from "../actions.js";

const HAND_OF_HEALING: AvailableAction = { key: "handOfHealing", name: "Hand of Healing", cost: "action", enabled: true };

// #1912: Physician's Touch (Warrior of Mercy L6, PHB'24 p.92) upgrades Hand
// of Healing in place — edition-invariant (Warrior of Mercy has no 2014
// counterpart, so this gates on subclass slug + level only).
describe("physiciansTouchAugmentor", () => {
  it("targets only handOfHealing", () => {
    expect(physiciansTouchAugmentor.targetKeys).toEqual(["handOfHealing"]);
  });

  it("appliesTo is true for Warrior of Mercy L6+, in either edition", () => {
    const ctx: AugmentorContext = { slug: "monk-warrior-of-mercy", entryLevel: PHYSICIANS_TOUCH_LEVEL, edition: "EDITION_2024" };
    expect(physiciansTouchAugmentor.appliesTo(ctx)).toBe(true);
    expect(physiciansTouchAugmentor.appliesTo({ ...ctx, edition: "EDITION_2014" })).toBe(true);
  });

  it("appliesTo is false below L6 or for a different subclass", () => {
    const base: AugmentorContext = { slug: "monk-warrior-of-mercy", entryLevel: PHYSICIANS_TOUCH_LEVEL, edition: "EDITION_2024" };
    expect(physiciansTouchAugmentor.appliesTo({ ...base, entryLevel: PHYSICIANS_TOUCH_LEVEL - 1 })).toBe(false);
    expect(physiciansTouchAugmentor.appliesTo({ ...base, slug: "monk-warrior-of-shadow" })).toBe(false);
  });

  it("augment returns only the incremental reminder text", () => {
    const ctx: AugmentorContext = { slug: "monk-warrior-of-mercy", entryLevel: PHYSICIANS_TOUCH_LEVEL, edition: "EDITION_2024" };
    expect(physiciansTouchAugmentor.augment(HAND_OF_HEALING, ctx)).toEqual({ reminderAppend: PHYSICIANS_TOUCH_REMINDER });
  });
});
