import { describe, expect, it } from "vitest";

import { deriveResources, resolveClassDie, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import { readEffectSpec, resolveEffectSpec, type EffectRow } from "@/lib/combat/effects.js";

const scores = { strength: 16, dexterity: 12 };

// Battle Master DerivedClassInfo at a given fighter level.
function battleMaster(level: number): DerivedClassInfo {
  const info = deriveResources("fighter", "battle master", level, scores, 4);
  if (!info) throw new Error("expected battle master resources");
  return info;
}

// A superiority-die maneuver effect: one die, faces referenced from the class pool.
const menacingAttack: EffectRow = {
  level: 3,
  effectKind: "damage",
  effectDiceCount: 1,
  effectDieSource: "superiorityDice",
};

describe("resolveClassDie", () => {
  it("resolves the superiority die at the three fighter breakpoints (d8/d10/d12)", () => {
    expect(resolveClassDie("superiorityDice", battleMaster(3))).toBe(8);
    expect(resolveClassDie("superiorityDice", battleMaster(9))).toBe(8);
    expect(resolveClassDie("superiorityDice", battleMaster(10))).toBe(10);
    expect(resolveClassDie("superiorityDice", battleMaster(17))).toBe(10);
    expect(resolveClassDie("superiorityDice", battleMaster(18))).toBe(12);
    expect(resolveClassDie("superiorityDice", battleMaster(20))).toBe(12);
  });

  it("returns null for an unknown source key", () => {
    expect(resolveClassDie("bogusPool", battleMaster(10))).toBeNull();
  });

  it("returns null for a pool that carries no die (e.g. Action Surge)", () => {
    expect(resolveClassDie("actionSurge", battleMaster(10))).toBeNull();
  });
});

describe("readEffectSpec — class-die reference", () => {
  it("resolves dice.faces from the character's fighter level (d8/d10/d12)", () => {
    for (const [level, faces] of [[9, 8], [10, 10], [18, 12]] as const) {
      const resolve = (source: string) => resolveClassDie(source, battleMaster(level));
      expect(readEffectSpec(menacingAttack, resolve).dice).toEqual({ count: 1, faces, modifier: 0 });
    }
  });

  it("supersedes a fixed effectDiceFaces when the source resolves", () => {
    const row: EffectRow = { ...menacingAttack, effectDiceFaces: 4 };
    const resolve = (source: string) => resolveClassDie(source, battleMaster(18));
    expect(readEffectSpec(row, resolve).dice?.faces).toBe(12);
  });

  it("falls back to fixed effectDiceFaces when the source cannot resolve", () => {
    const row: EffectRow = { ...menacingAttack, effectDiceFaces: 4 };
    expect(readEffectSpec(row, () => null).dice?.faces).toBe(4);
    expect(readEffectSpec(row).dice?.faces).toBe(4);
  });

  it("leaves dice undefined when the source is unresolved and no fixed faces exist", () => {
    expect(readEffectSpec(menacingAttack, () => null).dice).toBeUndefined();
    expect(readEffectSpec(menacingAttack).dice).toBeUndefined();
  });

  it("does not scale the die count — count-scaling stays with resolveEffectSpec", () => {
    const resolve = (source: string) => resolveClassDie(source, battleMaster(18));
    const spec = readEffectSpec(menacingAttack, resolve);
    expect(spec.scaling).toEqual({ mode: "none" });
    expect(resolveEffectSpec(spec, 0, { characterLevel: 18 })).toEqual({ count: 1, faces: 12, modifier: 0 });
  });
});
