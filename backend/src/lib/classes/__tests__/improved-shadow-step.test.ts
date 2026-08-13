import { describe, expect, it } from "vitest";

import { improvedShadowStepAugmentor, IMPROVED_SHADOW_STEP_LEVEL, IMPROVED_SHADOW_STEP_REMINDER } from "../improved-shadow-step.js";
import type { AugmentorContext } from "../announce-augmentors.js";
import type { AvailableAction } from "../actions.js";

const SHADOW_STEP: AvailableAction = { key: "shadowStep", name: "Shadow Step", cost: "bonusAction", enabled: true };

// #1912: Improved Shadow Step (Warrior of Shadow L11, PHB'24 p.91) upgrades
// the 2024 Shadow Step row in place — the 2014 Way of Shadow's own shadowStep
// (same key, different subclass) never upgrades at all.
describe("improvedShadowStepAugmentor", () => {
  it("targets only shadowStep", () => {
    expect(improvedShadowStepAugmentor.targetKeys).toEqual(["shadowStep"]);
  });

  it("appliesTo is true for Warrior of Shadow L11+ in 2024", () => {
    const ctx: AugmentorContext = { slug: "monk-warrior-of-shadow", entryLevel: IMPROVED_SHADOW_STEP_LEVEL, edition: "EDITION_2024" };
    expect(improvedShadowStepAugmentor.appliesTo(ctx)).toBe(true);
  });

  it("appliesTo is false below L11, for a different subclass, or in 2014", () => {
    const base: AugmentorContext = { slug: "monk-warrior-of-shadow", entryLevel: IMPROVED_SHADOW_STEP_LEVEL, edition: "EDITION_2024" };
    expect(improvedShadowStepAugmentor.appliesTo({ ...base, entryLevel: IMPROVED_SHADOW_STEP_LEVEL - 1 })).toBe(false);
    expect(improvedShadowStepAugmentor.appliesTo({ ...base, slug: "monk-way-of-shadow" })).toBe(false);
    // Way of Shadow (2014) never upgrades — same key, no Improved Shadow Step.
    expect(improvedShadowStepAugmentor.appliesTo({ ...base, slug: "monk-way-of-shadow", edition: "EDITION_2014" })).toBe(false);
    expect(improvedShadowStepAugmentor.appliesTo({ ...base, edition: "EDITION_2014" })).toBe(false);
  });

  it("augment returns only the incremental reminder text", () => {
    const ctx: AugmentorContext = { slug: "monk-warrior-of-shadow", entryLevel: IMPROVED_SHADOW_STEP_LEVEL, edition: "EDITION_2024" };
    expect(improvedShadowStepAugmentor.augment(SHADOW_STEP, ctx)).toEqual({ reminderAppend: IMPROVED_SHADOW_STEP_REMINDER });
  });
});
