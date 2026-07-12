import { describe, it, expect } from "vitest";

import { resultLineView } from "@/lib/attackResult";
import type { RollResult } from "@/lib/dice";

function d20(value: number, modifier = 0): RollResult {
  return {
    dice: [{ value, dropped: false }],
    modifier,
    total: value + modifier,
    spec: { count: 1, faces: 20, modifier },
  };
}

describe("resultLineView (#778)", () => {
  it("flags a natural 20 to-hit as a crit hit, not a miss", () => {
    const v = resultLineView(d20(20, 7), "attack");
    expect(v.critHit).toBe(true);
    expect(v.miss).toBe(false);
    expect(v.total).toBe(27);
    expect(v.tone.total).toContain("arcane");
  });

  it("flags a natural 1 to-hit as a miss, not a crit hit", () => {
    const v = resultLineView(d20(1, 5), "attack");
    expect(v.miss).toBe(true);
    expect(v.critHit).toBe(false);
  });

  it("never surfaces crit/miss cues on a damage roll (even a 20-valued die)", () => {
    const dmg: RollResult = {
      dice: [{ value: 20, dropped: false }],
      modifier: 3,
      total: 23,
      spec: { count: 1, faces: 20, modifier: 3 },
    };
    const v = resultLineView(dmg, "damage");
    expect(v.critHit).toBe(false);
    expect(v.miss).toBe(false);
    expect(v.tone.total).toContain("garnet");
  });

  it("excludes dropped (advantage) dice from keptDice", () => {
    const adv: RollResult = {
      dice: [
        { value: 4, dropped: true },
        { value: 19, dropped: false },
      ],
      modifier: 5,
      total: 24,
      spec: { count: 2, faces: 20, modifier: 5, mode: "advantage" },
    };
    const v = resultLineView(adv, "attack");
    expect(v.keptDice).toHaveLength(1);
    expect(v.keptDice[0].value).toBe(19);
  });

  it("prefers a maneuver override total and marks hasOverride", () => {
    const v = resultLineView(d20(18, 7), "attack", 31);
    expect(v.total).toBe(31);
    expect(v.hasOverride).toBe(true);
  });

  it("treats a zero override as a real total, not absent", () => {
    const v = resultLineView(d20(1, 0), "attack", 0);
    expect(v.total).toBe(0);
    expect(v.hasOverride).toBe(true);
  });

  it("falls back to the raw total when override is null/undefined", () => {
    expect(resultLineView(d20(10, 2), "attack", null).hasOverride).toBe(false);
    expect(resultLineView(d20(10, 2), "attack").total).toBe(12);
  });

  it("reflects a doubled-dice crit spec via critSpec", () => {
    const crit: RollResult = {
      dice: [
        { value: 6, dropped: false },
        { value: 2, dropped: false },
      ],
      modifier: 3,
      total: 11,
      spec: { count: 2, faces: 12, modifier: 3, crit: true },
    };
    expect(resultLineView(crit, "damage").critSpec).toBe(true);
  });
});
