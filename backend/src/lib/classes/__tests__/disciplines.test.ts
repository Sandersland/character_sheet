// Unit tests for the Way of the Four Elements discipline rules module
// (2014-only, #1503) — the pure functions only; the cast transaction is
// covered end-to-end in routes/character/__tests__/disciplines-cast.test.ts.
import { describe, expect, it } from "vitest";

import { disciplineEffectSpec, maxKiPerDiscipline } from "@/lib/classes/disciplines.js";

// PHB'14 p.80's Elemental Disciplines table: max ki spendable on ONE cast,
// by monk level. min(6, 2 + floor((monkLevel-1)/4)).
describe("maxKiPerDiscipline", () => {
  it("caps at 2/3/4/5/6 at monk level 3/5/9/13/17 (PHB'14 p.80)", () => {
    expect(maxKiPerDiscipline(3)).toBe(2);
    expect(maxKiPerDiscipline(4)).toBe(2);
    expect(maxKiPerDiscipline(5)).toBe(3);
    expect(maxKiPerDiscipline(8)).toBe(3);
    expect(maxKiPerDiscipline(9)).toBe(4);
    expect(maxKiPerDiscipline(12)).toBe(4);
    expect(maxKiPerDiscipline(13)).toBe(5);
    expect(maxKiPerDiscipline(16)).toBe(5);
    expect(maxKiPerDiscipline(17)).toBe(6);
    expect(maxKiPerDiscipline(20)).toBe(6);
  });
});

describe("disciplineEffectSpec", () => {
  it("scales a damage discipline by poolStep (ki spent above base cost)", () => {
    const spec = disciplineEffectSpec({
      name: "Fangs of the Fire Snake",
      costPerStep: 1,
      effectKind: "damage",
      effectDiceCount: 1,
      effectDiceFaces: 10,
      damageType: "fire",
      attackType: "attack",
    });
    expect(spec.effectType).toBe("damage");
    expect(spec.dice).toEqual({ count: 1, faces: 10, modifier: 0 });
    expect(spec.scaling).toEqual({ mode: "poolStep", dicePerStep: 1 });
    expect(spec.concentration).toBe(false);
  });

  it("marks the 7 concentration disciplines (PHB'14 p.81 spell equivalents) and no others", () => {
    const CONCENTRATES = [
      "Rush of the Gale Spirits",
      "Clench of the North Wind",
      "Mist Stance",
      "Ride the Wind",
      "Eternal Mountain Defense",
      "River of Hungry Flame",
      "Wave of Rolling Earth",
    ];
    const NOT = [
      "Fangs of the Fire Snake",
      "Fist of Four Thunders",
      "Fist of Unbroken Air",
      "Shape the Flowing River",
      "Sweeping Cinder Strike",
      "Water Whip",
      "Gong of the Summit",
      "Flames of the Phoenix",
      "Breath of Winter",
    ];
    for (const name of CONCENTRATES) {
      expect(disciplineEffectSpec({ name }).concentration, name).toBe(true);
    }
    for (const name of NOT) {
      expect(disciplineEffectSpec({ name }).concentration, name).toBe(false);
    }
  });

  it("has no dice for a utility discipline (no effectKind)", () => {
    const spec = disciplineEffectSpec({ name: "Shape the Flowing River" });
    expect(spec.dice).toBeUndefined();
    expect(spec.effectType).toBe("utility");
  });
});
