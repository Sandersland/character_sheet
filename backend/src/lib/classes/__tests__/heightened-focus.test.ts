import { describe, expect, it } from "vitest";

import { heightenedFocusAugmentor, HEIGHTENED_FOCUS_LEVEL } from "../heightened-focus.js";
import type { AugmentorContext } from "../announce-augmentors.js";
import type { AvailableAction } from "../actions.js";

const FLURRY: AvailableAction = { key: "flurryOfBlows", name: "Flurry of Blows", cost: "bonusAction", enabled: true, count: 2 };
const PATIENT_FOCUS: AvailableAction = { key: "patientDefenseFocus", name: "Patient Defense (1 Focus)", cost: "bonusAction", enabled: true };
const STEP_FOCUS: AvailableAction = { key: "stepOfTheWindFocus", name: "Step of the Wind (1 Focus)", cost: "bonusAction", enabled: true };

// #1912 (epic #1903's R entry): Heightened Focus (monk L10, PHB'24 p.88)
// upgrades three base-class rows in place — pins the descriptor's gate +
// payload shape in isolation, mirroring arcane-charge.test.ts's own split
// from the end-to-end joined-reminder proof (entry-scoped-actions.test.ts /
// monk-rogue-barbarian-actions-parity.test.ts).
describe("heightenedFocusAugmentor", () => {
  it("targets flurryOfBlows/patientDefenseFocus/stepOfTheWindFocus, no other key", () => {
    expect(heightenedFocusAugmentor.targetKeys).toEqual(["flurryOfBlows", "patientDefenseFocus", "stepOfTheWindFocus"]);
  });

  it("appliesTo is true at monk L10+ in 2024", () => {
    const ctx: AugmentorContext = { slug: undefined, entryLevel: HEIGHTENED_FOCUS_LEVEL, edition: "EDITION_2024" };
    expect(heightenedFocusAugmentor.appliesTo(ctx)).toBe(true);
    expect(heightenedFocusAugmentor.appliesTo({ ...ctx, entryLevel: 20 })).toBe(true);
  });

  it("appliesTo is false below L10, or in 2014 (no Heightened Focus upgrade exists)", () => {
    const base: AugmentorContext = { slug: undefined, entryLevel: HEIGHTENED_FOCUS_LEVEL, edition: "EDITION_2024" };
    expect(heightenedFocusAugmentor.appliesTo({ ...base, entryLevel: HEIGHTENED_FOCUS_LEVEL - 1 })).toBe(false);
    expect(heightenedFocusAugmentor.appliesTo({ ...base, edition: "EDITION_2014" })).toBe(false);
  });

  it("augment bumps flurryOfBlows.count to 3, never a reminder", () => {
    const ctx: AugmentorContext = { slug: undefined, entryLevel: HEIGHTENED_FOCUS_LEVEL, edition: "EDITION_2024" };
    expect(heightenedFocusAugmentor.augment(FLURRY, ctx)).toEqual({ count: 3 });
  });

  it("augment appends the temp-HP rider onto patientDefenseFocus", () => {
    const ctx: AugmentorContext = { slug: undefined, entryLevel: HEIGHTENED_FOCUS_LEVEL, edition: "EDITION_2024" };
    const payload = heightenedFocusAugmentor.augment(PATIENT_FOCUS, ctx);
    expect(payload?.reminderAppend).toMatch(/temporary hit points/);
    expect(payload?.count).toBeUndefined();
  });

  it("augment appends the move-a-willing-creature rider onto stepOfTheWindFocus", () => {
    const ctx: AugmentorContext = { slug: undefined, entryLevel: HEIGHTENED_FOCUS_LEVEL, edition: "EDITION_2024" };
    const payload = heightenedFocusAugmentor.augment(STEP_FOCUS, ctx);
    expect(payload?.reminderAppend).toMatch(/willing creature/);
  });

  it("augment returns null for an untargeted key", () => {
    const ctx: AugmentorContext = { slug: undefined, entryLevel: HEIGHTENED_FOCUS_LEVEL, edition: "EDITION_2024" };
    const other: AvailableAction = { key: "patientDefense", name: "Patient Defense", cost: "bonusAction", enabled: true };
    expect(heightenedFocusAugmentor.augment(other, ctx)).toBeNull();
  });
});
