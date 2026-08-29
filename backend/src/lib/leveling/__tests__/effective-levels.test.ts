import { describe, expect, it } from "vitest";

import { effectiveEntryLevel, levelDownEntryLevels, subclassActiveAt, subclassGateLevel } from "../effective-levels.js";

describe("effectiveEntryLevel", () => {
  it("uses the XP-derived level for a single-class character (stale entry.level ignored)", () => {
    expect(effectiveEntryLevel(2, 1, 5)).toBe(5);
    expect(effectiveEntryLevel(0, 0, 3)).toBe(3);
  });

  it("uses the per-entry level for a multiclass character", () => {
    expect(effectiveEntryLevel(3, 2, 8)).toBe(3);
    expect(effectiveEntryLevel(6, 3, 12)).toBe(6);
  });
});

describe("levelDownEntryLevels", () => {
  it("trims LIFO from the highest position first", () => {
    expect(levelDownEntryLevels([10, 1], 3)).toEqual([3, 0]);
    expect(levelDownEntryLevels([2, 3], 3)).toEqual([2, 1]);
  });

  it("floors the position-0 base class at 1, later entries at 0", () => {
    expect(levelDownEntryLevels([4, 4], 1)).toEqual([1, 0]);
  });

  it("returns the input unchanged when the sum is already within the target", () => {
    expect(levelDownEntryLevels([3, 2], 5)).toEqual([3, 2]);
    expect(levelDownEntryLevels([3, 2], 6)).toEqual([3, 2]);
  });

  // A per-entry `min(level, target)` would give [1, 3] here — the LIFO trim takes the tail entry below the target-level bound instead, which is why computeLevelDownState projects through THIS function, not a min().
  it("can trim a tail entry below min(level, target) — LIFO, not a per-entry cap", () => {
    expect(levelDownEntryLevels([1, 4], 3)).toEqual([1, 2]);
  });
});

describe("subclassGateLevel", () => {
  it("returns the declared gate under 2014 rules", () => {
    expect(subclassGateLevel(1, "EDITION_2014")).toBe(1);
    expect(subclassGateLevel(6, "EDITION_2014")).toBe(6);
  });

  // SRD 5.2: every class gains its subclass at level 3, so the catalog column is ignored under 2024 rules (#1128).
  it("is always 3 under 2024 rules, whatever the catalog says", () => {
    expect(subclassGateLevel(1, "EDITION_2024")).toBe(3);
    expect(subclassGateLevel(2, "EDITION_2024")).toBe(3);
    expect(subclassGateLevel(6, "EDITION_2024")).toBe(3);
  });

  it("defaults to 3 when undeclared, in both editions", () => {
    expect(subclassGateLevel(null, "EDITION_2014")).toBe(3);
    expect(subclassGateLevel(undefined, "EDITION_2014")).toBe(3);
    expect(subclassGateLevel(null, "EDITION_2024")).toBe(3);
    expect(subclassGateLevel(undefined, "EDITION_2024")).toBe(3);
  });
});

describe("subclassActiveAt", () => {
  it("is active at or above the gate", () => {
    expect(subclassActiveAt(3, 3, "EDITION_2024")).toBe(true);
    expect(subclassActiveAt(4, 3, "EDITION_2024")).toBe(true);
  });

  it("is inactive below the gate", () => {
    expect(subclassActiveAt(2, 3, "EDITION_2024")).toBe(false);
  });

  // A PHB'14 Wizard has its subclass at 2; the same sheet under 2024 does not.
  it("splits on edition for a class whose 2014 gate is below 3", () => {
    expect(subclassActiveAt(2, 2, "EDITION_2014")).toBe(true);
    expect(subclassActiveAt(2, 2, "EDITION_2024")).toBe(false);
  });

  it("applies the default-3 gate for an undeclared subclass level", () => {
    expect(subclassActiveAt(3, null, "EDITION_2024")).toBe(true);
    expect(subclassActiveAt(2, undefined, "EDITION_2024")).toBe(false);
  });
});
