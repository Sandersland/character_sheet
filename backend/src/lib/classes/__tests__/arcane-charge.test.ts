import { describe, expect, it } from "vitest";

import {
  arcaneChargeAugmentor,
  arcaneChargeAvailable,
  hasArcaneCharge,
  ARCANE_CHARGE_LEVEL,
  ARCANE_CHARGE_REMINDER,
} from "../arcane-charge.js";
import type { AugmentorContext } from "../announce-augmentors.js";

describe("arcaneChargeAvailable", () => {
  it("is available in 2014", () => {
    expect(arcaneChargeAvailable("EDITION_2014")).toBe(true);
  });

  // 2024 Eldritch Knight text is unverified/PARKED (#1531) — Arcane Charge
  // stays 2014-only, mirroring Weapon Bond's own stance (weapon-bond.ts).
  it("is NOT available in 2024", () => {
    expect(arcaneChargeAvailable("EDITION_2024")).toBe(false);
  });
});

describe("hasArcaneCharge", () => {
  it("is true for an Eldritch Knight at level 15+ in 2014", () => {
    expect(hasArcaneCharge(ARCANE_CHARGE_LEVEL, true, "EDITION_2014")).toBe(true);
    expect(hasArcaneCharge(ARCANE_CHARGE_LEVEL + 5, true, "EDITION_2014")).toBe(true);
    expect(hasArcaneCharge(20, true, "EDITION_2014")).toBe(true);
  });

  it("is false below level 15", () => {
    expect(hasArcaneCharge(ARCANE_CHARGE_LEVEL - 1, true, "EDITION_2014")).toBe(false);
    expect(hasArcaneCharge(1, true, "EDITION_2014")).toBe(false);
  });

  it("is false for a non-Eldritch-Knight, whatever the level", () => {
    expect(hasArcaneCharge(20, false, "EDITION_2014")).toBe(false);
  });

  it("is false in 2024, even for a qualifying level/subclass", () => {
    expect(hasArcaneCharge(ARCANE_CHARGE_LEVEL, true, "EDITION_2024")).toBe(false);
  });
});

// #1910: arcaneChargeAugmentor is the ANNOUNCE_AUGMENTORS descriptor that
// replaced actions.ts's old withArcaneChargeReminder `.map()`. It returns a
// structured payload only — the fold point (applyAnnounceAugmentors,
// announce-augmentors.ts) owns the actual reminder concatenation, so this
// suite pins the descriptor's gate + payload shape in isolation, not the
// join (entry-scoped-actions.test.ts's "Arcane Charge" describe block pins
// the end-to-end joined reminder through deriveEntryScopedActions).
describe("arcaneChargeAugmentor", () => {
  it("targets only actionSurge", () => {
    expect(arcaneChargeAugmentor.targetKeys).toEqual(["actionSurge"]);
  });

  it("appliesTo is true for an Eldritch Knight L15+ in 2014", () => {
    const ctx: AugmentorContext = { slug: "fighter-eldritch-knight", entryLevel: ARCANE_CHARGE_LEVEL, edition: "EDITION_2014" };
    expect(arcaneChargeAugmentor.appliesTo(ctx)).toBe(true);
  });

  it("appliesTo is false below level 15, for a non-Eldritch-Knight, or in 2024", () => {
    const base: AugmentorContext = { slug: "fighter-eldritch-knight", entryLevel: ARCANE_CHARGE_LEVEL, edition: "EDITION_2014" };
    expect(arcaneChargeAugmentor.appliesTo({ ...base, entryLevel: ARCANE_CHARGE_LEVEL - 1 })).toBe(false);
    expect(arcaneChargeAugmentor.appliesTo({ ...base, slug: undefined })).toBe(false);
    expect(arcaneChargeAugmentor.appliesTo({ ...base, edition: "EDITION_2024" })).toBe(false);
  });

  it("augment returns only the incremental reminder text, never a concatenated string", () => {
    const payload = arcaneChargeAugmentor.augment(
      { key: "actionSurge", name: "Action Surge", cost: "special", enabled: true, reminder: "Regain 1d10 + 15 HP" },
      { slug: "fighter-eldritch-knight", entryLevel: ARCANE_CHARGE_LEVEL, edition: "EDITION_2014" },
    );
    expect(payload).toEqual({ reminderAppend: ARCANE_CHARGE_REMINDER });
  });
});
