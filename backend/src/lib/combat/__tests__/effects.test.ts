import { describe, expect, it } from "vitest";

import {
  catalogEffectSpec,
  readEffectSpec,
  resolveBuffSpec,
  resolveEffectSpec,
  type EffectRow,
  type EffectScaling,
} from "@/lib/combat/effects.js";

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

// #817 pins: the shared catalog-row→EffectSpec builder consumed by both the
// disciplineEffectSpec (focus scaling) and shadowArtEffectSpec (flat) wrappers.
describe("catalogEffectSpec — shared focus-cast row→spec builder (#817)", () => {
  const focusScaling: EffectScaling = { mode: "focus", dicePerStep: 2 };

  it("maps a focus-scaled damage row with dice (discipline shape)", () => {
    const spec = catalogEffectSpec(
      {
        name: "Flames of the Phoenix",
        effectKind: "damage",
        effectDiceCount: 8,
        effectDiceFaces: 6,
        effectModifier: 0,
        damageType: "fire",
        attackType: "save",
        saveAbility: "dexterity",
        saveEffect: "half",
      },
      { scaling: focusScaling, concentrates: () => false },
    );
    expect(spec).toEqual({
      effectType: "damage",
      dice: { count: 8, faces: 6, modifier: 0 },
      damageType: "fire",
      attackType: "save",
      saveAbility: "dexterity",
      saveEffect: "half",
      scaling: { mode: "focus", dicePerStep: 2 },
      concentration: false,
      buffTarget: null,
      buffModifier: null,
    });
  });

  it("leaves dice undefined for a utility row and honors the concentration predicate", () => {
    const spec = catalogEffectSpec(
      { name: "Mist Stance" },
      { scaling: { mode: "focus", dicePerStep: 0 }, concentrates: (name) => name === "Mist Stance" },
    );
    expect(spec.dice).toBeUndefined();
    expect(spec.effectType).toBe("utility");
    expect(spec.concentration).toBe(true);
  });

  it("maps a flat buff row (shadow-art shape) with buff fields and no dice/save", () => {
    const spec = catalogEffectSpec(
      { name: "Test Buff Art", effectKind: "buff", buffTarget: "stealth", buffModifier: 10 },
      { scaling: { mode: "none" }, concentrates: () => true },
    );
    expect(spec).toEqual({
      effectType: "buff",
      dice: undefined,
      damageType: null,
      attackType: null,
      saveAbility: null,
      saveEffect: null,
      scaling: { mode: "none" },
      concentration: true,
      buffTarget: "stealth",
      buffModifier: 10,
    });
  });

  it("treats a missing/unknown effectKind as roll-less utility with null buff fields", () => {
    const spec = catalogEffectSpec(
      { name: "Test Utility Art" },
      { scaling: { mode: "none" }, concentrates: () => false },
    );
    expect(spec.effectType).toBe("utility");
    expect(spec.buffTarget).toBeNull();
    expect(spec.buffModifier).toBeNull();
    expect(spec.concentration).toBe(false);
  });

  it("maps a heal row to heal but never adds the ability modifier (focus abilities roll flat)", () => {
    const spec = catalogEffectSpec(
      { name: "H", effectKind: "heal", effectDiceCount: 1, effectDiceFaces: 8 },
      { scaling: { mode: "focus", dicePerStep: 1 }, concentrates: () => false },
    );
    expect(spec.effectType).toBe("heal");
    expect(spec.addAbilityModToHeal).toBeUndefined();
  });

  it("reads dice-less when either the count or the faces is missing", () => {
    const cfg = { scaling: focusScaling, concentrates: () => false };
    expect(catalogEffectSpec({ name: "X", effectKind: "damage", effectDiceCount: 8 }, cfg).dice).toBeUndefined();
    expect(catalogEffectSpec({ name: "X", effectKind: "damage", effectDiceFaces: 6 }, cfg).dice).toBeUndefined();
  });
});

// #685 pins: the die-source resolution arm combined with the non-damage effect
// kinds (class-die.test.ts covers die-source × damage only), plus a full-field
// buff byte pin. Green before the reader decomposition; unedited through it.
describe("readEffectSpec — die-source × heal/buff combos (#685)", () => {
  const healFromClassDie: EffectRow = {
    level: 1,
    effectKind: "heal",
    effectDiceCount: 2,
    effectDieSource: "superiorityDice",
  };

  const blessBuff: EffectRow = {
    level: 1,
    effectKind: "buff",
    buffTarget: "attackRolls",
    buffModifier: 1,
    concentration: true,
  };

  it("die-source × heal: resolver supplies the faces, heal semantics intact", () => {
    const spec = readEffectSpec(healFromClassDie, () => 8);
    expect(spec.effectType).toBe("heal");
    expect(spec.dice).toEqual({ count: 2, faces: 8, modifier: 0 });
    expect(spec.addAbilityModToHeal).toBe(true);
  });

  it("die-source × heal with no resolver and no fixed faces reads as dice-less", () => {
    const spec = readEffectSpec(healFromClassDie);
    expect(spec.dice).toBeUndefined();
    expect(spec.effectType).toBe("heal");
  });

  it("die-source with a resolver that returns null falls back to fixed effectDiceFaces (#697)", () => {
    // effectDieSource is set AND a fixed effectDiceFaces exists; the resolver
    // resolves the source to null → dice fall back to the fixed faces.
    const withFixedFallback: EffectRow = { ...healFromClassDie, effectDiceFaces: 6 };
    const spec = readEffectSpec(withFixedFallback, () => null);
    expect(spec.dice).toEqual({ count: 2, faces: 6, modifier: 0 });
  });

  it("dice-less buff: full spec byte pin + resolveBuffSpec descriptor", () => {
    const spec = readEffectSpec(blessBuff);
    expect(spec).toEqual({
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
    expect(resolveBuffSpec(spec)).toEqual({ target: "attackRolls", modifier: 1 });
  });

  it("die-source × buff: resolved faces attach dice without changing the buff payload", () => {
    const spec = readEffectSpec({ ...blessBuff, effectDiceCount: 1, effectDieSource: "superiorityDice" }, () => 10);
    expect(spec.effectType).toBe("buff");
    expect(spec.dice).toEqual({ count: 1, faces: 10, modifier: 0 });
    expect(resolveBuffSpec(spec)).toEqual({ target: "attackRolls", modifier: 1 });
  });

  it("resolveBuffSpec: null for non-buffs and target-less buffs; modifier defaults to 0", () => {
    expect(resolveBuffSpec(readEffectSpec(fireball))).toBeNull();
    expect(resolveBuffSpec(readEffectSpec({ level: 1, effectKind: "buff" }))).toBeNull();
    expect(resolveBuffSpec(readEffectSpec({ level: 1, effectKind: "buff", buffTarget: "initiative" })))
      .toEqual({ target: "initiative", modifier: 0 });
  });
});
