import { describe, expect, it } from "vitest";

import {
  canApplySneakAttack,
  resolveSneakAttackDie,
  sneakAttackDiceCount,
  sneakAttackSpec,
  SNEAK_ATTACK_DIE_SOURCE,
} from "@/lib/classes/rogue.js";

describe("sneakAttackDiceCount", () => {
  it("is 1d6 at level 1 and adds a die every odd level", () => {
    const expected: [number, number][] = [
      [1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3], [7, 4],
      [8, 4], [9, 5], [10, 5], [11, 6], [13, 7], [15, 8], [17, 9], [19, 10],
    ];
    for (const [level, dice] of expected) {
      expect(sneakAttackDiceCount(level)).toBe(dice);
    }
  });

  it("caps at 10d6 from level 19 through 20", () => {
    expect(sneakAttackDiceCount(19)).toBe(10);
    expect(sneakAttackDiceCount(20)).toBe(10);
  });

  it("is 0 below level 1 (non-rogue / level 0)", () => {
    expect(sneakAttackDiceCount(0)).toBe(0);
    expect(sneakAttackDiceCount(-3)).toBe(0);
  });
});

describe("resolveSneakAttackDie (C5 referenced-class-die reuse)", () => {
  it("resolves the sneak-attack source to a d6", () => {
    expect(resolveSneakAttackDie(SNEAK_ATTACK_DIE_SOURCE)).toBe(6);
  });

  it("returns null for any other source", () => {
    expect(resolveSneakAttackDie("superiorityDice")).toBeNull();
  });
});

describe("sneakAttackSpec", () => {
  it("resolves Nd6 through the effects.ts machinery (level 7 → 4d6)", () => {
    expect(sneakAttackSpec(7)).toEqual({ count: 4, faces: 6, modifier: 0 });
  });

  it("scales the die COUNT by level while the faces stay d6", () => {
    expect(sneakAttackSpec(1)).toEqual({ count: 1, faces: 6, modifier: 0 });
    expect(sneakAttackSpec(19)).toEqual({ count: 10, faces: 6, modifier: 0 });
  });

  it("is null below level 1 (no dice to roll)", () => {
    expect(sneakAttackSpec(0)).toBeNull();
  });
});

describe("canApplySneakAttack (once-per-turn + eligibility guard)", () => {
  it("allows a first, eligible application", () => {
    expect(canApplySneakAttack({ eligible: true, usedThisTurn: false })).toBe(true);
  });

  it("blocks a second application in the same turn", () => {
    expect(canApplySneakAttack({ eligible: true, usedThisTurn: true })).toBe(false);
  });

  it("blocks an ineligible application (no advantage / no adjacent ally)", () => {
    expect(canApplySneakAttack({ eligible: false, usedThisTurn: false })).toBe(false);
  });
});
