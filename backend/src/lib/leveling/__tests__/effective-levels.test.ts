import { describe, expect, it } from "vitest";

import { effectiveEntryLevel, subclassActiveAt, subclassGateLevel } from "../effective-levels.js";

describe("effectiveEntryLevel", () => {
  it("uses the XP-derived level for a single-class character (stale entry.level ignored)", () => {
    expect(effectiveEntryLevel(2, 1, 5)).toBe(5);
    expect(effectiveEntryLevel(0, 0, 3)).toBe(3); // no entries → still derived
  });

  it("uses the per-entry level for a multiclass character", () => {
    expect(effectiveEntryLevel(3, 2, 8)).toBe(3);
    expect(effectiveEntryLevel(6, 3, 12)).toBe(6);
  });
});

describe("subclassGateLevel", () => {
  it("returns the declared gate", () => {
    expect(subclassGateLevel(1)).toBe(1);
    expect(subclassGateLevel(6)).toBe(6);
  });

  it("defaults to 3 when undeclared", () => {
    expect(subclassGateLevel(null)).toBe(3);
    expect(subclassGateLevel(undefined)).toBe(3);
  });
});

describe("subclassActiveAt", () => {
  it("is active at or above the gate", () => {
    expect(subclassActiveAt(3, 3)).toBe(true);
    expect(subclassActiveAt(4, 3)).toBe(true);
  });

  it("is inactive below the gate", () => {
    expect(subclassActiveAt(2, 3)).toBe(false);
  });

  it("applies the default-3 gate for an undeclared subclass level", () => {
    expect(subclassActiveAt(3, null)).toBe(true);
    expect(subclassActiveAt(2, undefined)).toBe(false);
  });
});
