import { describe, expect, it } from "vitest";

import { readEffectSpec, resolveEffectSpec, type EffectRow } from "../effects.js";

const fireball: EffectRow = {
  level: 3,
  effectKind: "damage",
  effectDiceCount: 8,
  effectDiceFaces: 6,
  effectModifier: 0,
  damageType: "fire",
  attackType: "save",
  saveAbility: "dexterity",
  saveEffect: "half",
  upcastDicePerLevel: 1,
};

const fireBolt: EffectRow = {
  level: 0,
  effectKind: "damage",
  effectDiceCount: 1,
  effectDiceFaces: 10,
  damageType: "fire",
  attackType: "attack",
  cantripScaling: true,
};

const cureWounds: EffectRow = {
  level: 1,
  effectKind: "heal",
  effectDiceCount: 2,
  effectDiceFaces: 4,
  effectModifier: 0,
};

const detectMagic: EffectRow = { level: 1 };

describe("readEffectSpec", () => {
  it("selects slotUpcast scaling for a leveled spell with upcast dice", () => {
    const spec = readEffectSpec(fireball);
    expect(spec.effectType).toBe("damage");
    expect(spec.dice).toEqual({ count: 8, faces: 6, modifier: 0 });
    expect(spec.scaling).toEqual({ mode: "slotUpcast", dicePerStep: 1 });
    expect(spec.addAbilityModToHeal).toBe(false);
  });

  it("selects cantripLevel scaling for a scaling cantrip", () => {
    expect(readEffectSpec(fireBolt).scaling).toEqual({ mode: "cantripLevel" });
  });

  it("flags heal spells to add the ability modifier", () => {
    const spec = readEffectSpec(cureWounds);
    expect(spec.effectType).toBe("heal");
    expect(spec.addAbilityModToHeal).toBe(true);
  });

  it("leaves dice undefined for a utility spell", () => {
    const spec = readEffectSpec(detectMagic);
    expect(spec.dice).toBeUndefined();
    expect(spec.effectType).toBe("utility");
    expect(spec.scaling).toEqual({ mode: "none" });
  });
});

describe("resolveEffectSpec — golden byte-parity", () => {
  it("Fireball upcast at slot 5 adds upcastDicePerLevel per extra level", () => {
    const spec = readEffectSpec(fireball);
    expect(resolveEffectSpec(spec, 2, { characterLevel: 1 })).toEqual({ count: 10, faces: 6, modifier: 0 });
  });

  it("scaling cantrip counts 1/2/3/4 at char level 1/5/11/17", () => {
    const spec = readEffectSpec(fireBolt);
    expect(resolveEffectSpec(spec, 0, { characterLevel: 1 })).toEqual({ count: 1, faces: 10, modifier: 0 });
    expect(resolveEffectSpec(spec, 0, { characterLevel: 5 })).toEqual({ count: 2, faces: 10, modifier: 0 });
    expect(resolveEffectSpec(spec, 0, { characterLevel: 11 })).toEqual({ count: 3, faces: 10, modifier: 0 });
    expect(resolveEffectSpec(spec, 0, { characterLevel: 17 })).toEqual({ count: 4, faces: 10, modifier: 0 });
  });

  it("heal adds the ability modifier; damage does not", () => {
    expect(resolveEffectSpec(readEffectSpec(cureWounds), 0, { characterLevel: 1, abilityMod: 3 })).toEqual({
      count: 2,
      faces: 4,
      modifier: 3,
    });
    expect(resolveEffectSpec(readEffectSpec(fireball), 0, { characterLevel: 1, abilityMod: 3 })).toEqual({
      count: 8,
      faces: 6,
      modifier: 0,
    });
  });

  it("utility spell resolves to null", () => {
    expect(resolveEffectSpec(readEffectSpec(detectMagic), 0, { characterLevel: 1 })).toBeNull();
  });
});
