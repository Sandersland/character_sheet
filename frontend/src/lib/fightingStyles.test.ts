import { describe, it, expect } from "vitest";

import {
  FIGHTING_STYLE_LABELS,
  FIGHTING_STYLE_DESCRIPTIONS,
  FIGHTING_STYLE_OPTIONS,
  fightingStyleLabel,
} from "@/lib/fightingStyles";
import type { FightingStyleKey } from "@/types/character";

const ALL_KEYS: FightingStyleKey[] = [
  "archery",
  "defense",
  "dueling",
  "greatWeaponFighting",
  "protection",
  "twoWeaponFighting",
];

describe("fightingStyles label data", () => {
  it("has a non-empty label and description for every key", () => {
    for (const key of ALL_KEYS) {
      expect(FIGHTING_STYLE_LABELS[key]).toBeTruthy();
      expect(FIGHTING_STYLE_DESCRIPTIONS[key]).toBeTruthy();
    }
  });

  it("FIGHTING_STYLE_OPTIONS covers all 6 styles with key/label/description", () => {
    expect(FIGHTING_STYLE_OPTIONS).toHaveLength(6);
    expect(FIGHTING_STYLE_OPTIONS.map((o) => o.key).sort()).toEqual([...ALL_KEYS].sort());
    for (const opt of FIGHTING_STYLE_OPTIONS) {
      expect(opt.label).toBe(FIGHTING_STYLE_LABELS[opt.key]);
      expect(opt.description).toBe(FIGHTING_STYLE_DESCRIPTIONS[opt.key]);
    }
  });
});

describe("fightingStyleLabel", () => {
  it("resolves a known key to its human label, never the raw key", () => {
    expect(fightingStyleLabel("archery")).toBe("Archery");
    expect(fightingStyleLabel("greatWeaponFighting")).toBe("Great Weapon Fighting");
    expect(fightingStyleLabel("twoWeaponFighting")).toBe("Two-Weapon Fighting");
    // Never leaks the camelCase key.
    expect(fightingStyleLabel("greatWeaponFighting")).not.toBe("greatWeaponFighting");
  });

  it("degrades gracefully to the raw value for an unknown key", () => {
    expect(fightingStyleLabel("notARealStyle")).toBe("notARealStyle");
  });
});
