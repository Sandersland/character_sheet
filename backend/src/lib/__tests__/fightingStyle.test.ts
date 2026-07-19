import { describe, it, expect } from "vitest";

import {
  FIGHTING_STYLES,
  isKnownFightingStyle,
  fightingStyleChoiceCount,
} from "@/lib/srd/srd.js";
import {
  normalizeResourcesMutable,
  serializeResourcesState,
} from "@/lib/classes/resources.js";

describe("FIGHTING_STYLES data block", () => {
  it("defines the 6 core fighting styles with key/label/description", () => {
    const keys = FIGHTING_STYLES.map((s) => s.key).sort();
    expect(keys).toEqual(
      [
        "archery",
        "defense",
        "dueling",
        "greatWeaponFighting",
        "protection",
        "twoWeaponFighting",
      ].sort(),
    );
    for (const style of FIGHTING_STYLES) {
      expect(typeof style.label).toBe("string");
      expect(style.label.length).toBeGreaterThan(0);
      expect(typeof style.description).toBe("string");
      expect(style.description.length).toBeGreaterThan(0);
    }
  });
});

describe("isKnownFightingStyle", () => {
  it("returns true for known keys", () => {
    expect(isKnownFightingStyle("archery")).toBe(true);
    expect(isKnownFightingStyle("defense")).toBe(true);
  });
  it("returns false for unknown keys", () => {
    expect(isKnownFightingStyle("notARealStyle")).toBe(false);
    expect(isKnownFightingStyle("")).toBe(false);
  });
});

describe("fightingStyleChoiceCount", () => {
  it("Fighter at level >= 1 gets 1 choice", () => {
    expect(fightingStyleChoiceCount("fighter", 1)).toBe(1);
    expect(fightingStyleChoiceCount("Fighter", 5)).toBe(1);
    expect(fightingStyleChoiceCount("fighter", 20)).toBe(1);
  });
  it("non-fighters get 0", () => {
    expect(fightingStyleChoiceCount("wizard", 5)).toBe(0);
    expect(fightingStyleChoiceCount("rogue", 6)).toBe(0);
    expect(fightingStyleChoiceCount("paladin", 5)).toBe(0);
  });
  it("level 0 fighter gets 0", () => {
    expect(fightingStyleChoiceCount("fighter", 0)).toBe(0);
  });
});

describe("resources normalize/serialize round-trip for fightingStyle", () => {
  it("defaults fightingStyle to null when absent", () => {
    expect(normalizeResourcesMutable(null).fightingStyle).toBeNull();
    expect(normalizeResourcesMutable({ used: {} }).fightingStyle).toBeNull();
  });

  it("round-trips a known fighting style", () => {
    const state = normalizeResourcesMutable({ fightingStyle: "archery" });
    expect(state.fightingStyle).toBe("archery");
    const serialized = serializeResourcesState(state) as Record<string, unknown>;
    expect(serialized.fightingStyle).toBe("archery");
    // Re-normalize the serialized form to confirm a full round-trip.
    expect(normalizeResourcesMutable(serialized as never).fightingStyle).toBe("archery");
  });

  it("drops an unknown persisted fighting style key", () => {
    expect(normalizeResourcesMutable({ fightingStyle: "notAStyle" }).fightingStyle).toBeNull();
    expect(normalizeResourcesMutable({ fightingStyle: 42 }).fightingStyle).toBeNull();
  });

  it("preserves other resource lists alongside fightingStyle", () => {
    const state = normalizeResourcesMutable({
      used: { superiorityDice: 2 },
      maneuversKnown: [{ id: "m1", name: "Trip", description: "x" }],
      fightingStyle: "defense",
    });
    const serialized = serializeResourcesState(state) as Record<string, unknown>;
    expect(serialized.used).toEqual({ superiorityDice: 2 });
    expect((serialized.maneuversKnown as unknown[]).length).toBe(1);
    expect(serialized.fightingStyle).toBe("defense");
  });
});
