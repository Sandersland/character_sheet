/**
 * Characterization for the frontend readEffectSpec/resolveEffectSpec twins
 * (#685). This file mirrors backend/src/lib/combat/__tests__/effects.test.ts
 * case-for-case (same fixture values) so the two hand-mirrored readers stay
 * diffably parallel, and adds the variants the backend suite pins elsewhere
 * or that were unpinned on this side entirely (buff, ki scaling, full-field
 * pass-through). Green before the #685 decomposition; stays unedited through it.
 */
import { describe, expect, it } from "vitest";

import { readEffectSpec, resolveEffectSpec, type EffectRow, type EffectSpec } from "@/lib/effects";

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

const blessBuff: EffectRow = {
  level: 1,
  effectKind: "buff",
  buffTarget: "attackRolls",
  buffModifier: 1,
  concentration: true,
};

describe("readEffectSpec", () => {
  it("reads a leveled damage spell: full spec byte pin", () => {
    expect(readEffectSpec(fireball)).toEqual({
      effectType: "damage",
      dice: { count: 8, faces: 6, modifier: 0 },
      damageType: "fire",
      attackType: "save",
      saveAbility: "dexterity",
      saveEffect: "half",
      scaling: { mode: "slotUpcast", dicePerStep: 1 },
      concentration: undefined,
      addAbilityModToHeal: false,
      buffTarget: null,
      buffModifier: null,
    });
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

  it("reads a dice-less buff: full spec byte pin (previously unpinned)", () => {
    expect(readEffectSpec(blessBuff)).toEqual({
      effectType: "buff",
      dice: undefined,
      damageType: null,
      attackType: null,
      saveAbility: null,
      saveEffect: null,
      scaling: { mode: "none" },
      concentration: true,
      addAbilityModToHeal: false,
      buffTarget: "attackRolls",
      buffModifier: 1,
    });
  });

  it("a buff MAY carry dice — effectType and dice are orthogonal", () => {
    const spec = readEffectSpec({ ...blessBuff, effectDiceCount: 1, effectDiceFaces: 4 });
    expect(spec.effectType).toBe("buff");
    expect(spec.dice).toEqual({ count: 1, faces: 4, modifier: 0 });
  });

  it("a zero dice count reads as dice-less", () => {
    expect(readEffectSpec({ ...fireball, effectDiceCount: 0 }).dice).toBeUndefined();
  });
});

describe("resolveEffectSpec — golden byte-parity with the backend", () => {
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

  it("heal adds the ability modifier on top of the dice modifier; damage does not", () => {
    expect(resolveEffectSpec(readEffectSpec(cureWounds), 0, { characterLevel: 1, abilityMod: 3 })).toEqual({
      count: 2,
      faces: 4,
      modifier: 3,
    });
    expect(
      resolveEffectSpec(readEffectSpec({ ...cureWounds, effectModifier: 2 }), 0, { characterLevel: 1, abilityMod: 3 }),
    ).toEqual({ count: 2, faces: 4, modifier: 5 });
    expect(resolveEffectSpec(readEffectSpec(fireball), 0, { characterLevel: 1, abilityMod: 3 })).toEqual({
      count: 8,
      faces: 6,
      modifier: 0,
    });
  });

  it("utility spell resolves to null", () => {
    expect(resolveEffectSpec(readEffectSpec(detectMagic), 0, { characterLevel: 1 })).toBeNull();
  });

  it("ki scaling adds dicePerStep per ki above base (frontend-only entry point)", () => {
    const kiSpec: EffectSpec = {
      effectType: "damage",
      dice: { count: 1, faces: 10, modifier: 0 },
      scaling: { mode: "ki", dicePerStep: 1 },
      addAbilityModToHeal: false,
    };
    expect(resolveEffectSpec(kiSpec, 2, { characterLevel: 5 })).toEqual({ count: 3, faces: 10, modifier: 0 });
  });
});
