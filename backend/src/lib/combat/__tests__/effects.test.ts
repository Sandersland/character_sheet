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

// Eldritch Blast (PHB'14 p.237 / SRD 5.2): one beam, 1d10 force, scaling the BEAM COUNT (not the
// dice) at character level 5/11/17 — instanceCount is the cantripLevel scaling target here.
const eldritchBlast: EffectRow = {
  level: 0,
  effectKind: "damage",
  effectDiceCount: 1,
  effectDiceFaces: 10,
  damageType: "force",
  attackType: "attack",
  cantripScaling: true,
  instanceCount: 1,
  instanceRoll: "each",
};

// Magic Missile (#1981) — 3 darts, 1d4+1 EACH, +1 dart per slot level above 1st. instanceRoll
// "once" pins the 2014 Sage Advice ruling; readEffectSpec/resolveEffectSpec don't care which
// edition a row came from, only that the column says "once".
const magicMissile: EffectRow = {
  level: 1,
  effectKind: "damage",
  effectDiceCount: 1,
  effectDiceFaces: 4,
  effectModifier: 1,
  damageType: "force",
  upcastInstancesPerLevel: 1,
  instanceCount: 3,
  instanceRoll: "once",
};

// Scorching Ray (#1981) — 3 rays, 2d6 EACH, +1 ray per slot level above 2nd, each ray its own attack roll.
const scorchingRay: EffectRow = {
  level: 2,
  effectKind: "damage",
  effectDiceCount: 2,
  effectDiceFaces: 6,
  damageType: "fire",
  attackType: "attack",
  upcastInstancesPerLevel: 1,
  instanceCount: 3,
  instanceRoll: "each",
};

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

  it("resolves instances for a multi-instance cantrip, dice unaffected", () => {
    const spec = readEffectSpec(eldritchBlast);
    expect(spec.dice).toEqual({ count: 1, faces: 10, modifier: 0 });
    expect(spec.instances).toEqual({ count: 1, roll: "each" });
    expect(spec.scaling).toEqual({ mode: "cantripLevel" });
  });

  it("selects slotUpcast scaling from upcastInstancesPerLevel alone (no upcastDicePerLevel)", () => {
    const spec = readEffectSpec(magicMissile);
    expect(spec.scaling).toEqual({ mode: "slotUpcast", instancesPerStep: 1 });
    expect(spec.instances).toEqual({ count: 3, roll: "once" });
  });

  it("omits the instances key entirely for an un-instanced row (not merely undefined — a snapshot-serialized spec must be byte-identical to pre-#1981)", () => {
    expect(readEffectSpec(fireball).instances).toBeUndefined();
    expect(readEffectSpec(fireBolt).instances).toBeUndefined();
    expect("instances" in readEffectSpec(fireball)).toBe(false);
    expect("instances" in readEffectSpec(fireBolt)).toBe(false);
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

  // Non-boundary levels one below each threshold — a `>` typo in cantripTierMultiplier (instead of
  // `>=`) would pass the boundary-only test above but fail these.
  it("scaling cantrip stays at the PRIOR tier one level below each threshold (4/10/16)", () => {
    const spec = readEffectSpec(fireBolt);
    expect(resolveEffectSpec(spec, 0, { characterLevel: 4 })).toEqual({ count: 1, faces: 10, modifier: 0 });
    expect(resolveEffectSpec(spec, 0, { characterLevel: 10 })).toEqual({ count: 2, faces: 10, modifier: 0 });
    expect(resolveEffectSpec(spec, 0, { characterLevel: 16 })).toEqual({ count: 3, faces: 10, modifier: 0 });
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

  it("Eldritch Blast: instance count scales 1/2/3/4 at char level 1/5/11/17, dice fixed at 1d10", () => {
    const spec = readEffectSpec(eldritchBlast);
    expect(resolveEffectSpec(spec, 0, { characterLevel: 1 })).toEqual({ count: 1, faces: 10, modifier: 0, instanceCount: 1 });
    expect(resolveEffectSpec(spec, 0, { characterLevel: 5 })).toEqual({ count: 1, faces: 10, modifier: 0, instanceCount: 2 });
    expect(resolveEffectSpec(spec, 0, { characterLevel: 11 })).toEqual({ count: 1, faces: 10, modifier: 0, instanceCount: 3 });
    expect(resolveEffectSpec(spec, 0, { characterLevel: 17 })).toEqual({ count: 1, faces: 10, modifier: 0, instanceCount: 4 });
  });

  it("Eldritch Blast: instance count stays at the PRIOR tier one level below each threshold (4/10/16)", () => {
    const spec = readEffectSpec(eldritchBlast);
    expect(resolveEffectSpec(spec, 0, { characterLevel: 4 })).toEqual({ count: 1, faces: 10, modifier: 0, instanceCount: 1 });
    expect(resolveEffectSpec(spec, 0, { characterLevel: 10 })).toEqual({ count: 1, faces: 10, modifier: 0, instanceCount: 2 });
    expect(resolveEffectSpec(spec, 0, { characterLevel: 16 })).toEqual({ count: 1, faces: 10, modifier: 0, instanceCount: 3 });
  });

  it("Magic Missile: instance count 3/4/5 at slot levels 1/2/3, dice fixed at 1d4+1", () => {
    const spec = readEffectSpec(magicMissile);
    expect(resolveEffectSpec(spec, 0, { characterLevel: 1 })).toEqual({ count: 1, faces: 4, modifier: 1, instanceCount: 3 });
    expect(resolveEffectSpec(spec, 1, { characterLevel: 1 })).toEqual({ count: 1, faces: 4, modifier: 1, instanceCount: 4 });
    expect(resolveEffectSpec(spec, 2, { characterLevel: 1 })).toEqual({ count: 1, faces: 4, modifier: 1, instanceCount: 5 });
  });

  it("Scorching Ray: instance count 3/4 at slot levels 2/3, dice fixed at 2d6", () => {
    const spec = readEffectSpec(scorchingRay);
    expect(resolveEffectSpec(spec, 0, { characterLevel: 1 })).toEqual({ count: 2, faces: 6, modifier: 0, instanceCount: 3 });
    expect(resolveEffectSpec(spec, 1, { characterLevel: 1 })).toEqual({ count: 2, faces: 6, modifier: 0, instanceCount: 4 });
  });

  it("Fire Bolt (un-instanced cantrip): count scales, no instanceCount key served", () => {
    const spec = readEffectSpec(fireBolt);
    const resolved = resolveEffectSpec(spec, 0, { characterLevel: 5 })!;
    expect(resolved).toEqual({ count: 2, faces: 10, modifier: 0 });
    expect(resolved.instanceCount).toBeUndefined();
    // Key ABSENCE, not merely undefined — matches readEffectSpec's own "instances" omission (#1981 review).
    expect("instanceCount" in resolved).toBe(false);
  });

  it("poolStep scales by the pool overspend step, identically to slotUpcast", () => {
    const spec = catalogEffectSpec(
      {
        name: "Fangs of the Fire Snake",
        effectKind: "damage",
        effectDiceCount: 1,
        effectDiceFaces: 10,
        damageType: "fire",
        attackType: "attack",
      },
      { scaling: { mode: "poolStep", dicePerStep: 1 }, concentrates: () => false },
    );
    expect(resolveEffectSpec(spec, 0, { characterLevel: 3 })).toEqual({ count: 1, faces: 10, modifier: 0 });
    expect(resolveEffectSpec(spec, 3, { characterLevel: 3 })).toEqual({ count: 4, faces: 10, modifier: 0 });
  });
});

describe("catalogEffectSpec — shared focus-cast row→spec builder (#817)", () => {
  const scaledConfig: EffectScaling = { mode: "slotUpcast", dicePerStep: 2 };

  it("maps a scaled damage row with dice, passing the scaling axis through", () => {
    const spec = catalogEffectSpec(
      {
        name: "Elemental Burst",
        effectKind: "damage",
        effectDiceCount: 8,
        effectDiceFaces: 6,
        effectModifier: 0,
        damageType: "fire",
        attackType: "save",
        saveAbility: "dexterity",
        saveEffect: "half",
      },
      { scaling: scaledConfig, concentrates: () => false },
    );
    expect(spec).toEqual({
      effectType: "damage",
      dice: { count: 8, faces: 6, modifier: 0 },
      damageType: "fire",
      attackType: "save",
      saveAbility: "dexterity",
      saveEffect: "half",
      scaling: { mode: "slotUpcast", dicePerStep: 2 },
      concentration: false,
      buffTarget: null,
      buffModifier: null,
    });
  });

  it("leaves dice undefined for a utility row and honors the concentration predicate", () => {
    const spec = catalogEffectSpec(
      { name: "Mist Stance" },
      { scaling: { mode: "none" }, concentrates: (name) => name === "Mist Stance" },
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
      { scaling: { mode: "none" }, concentrates: () => false },
    );
    expect(spec.effectType).toBe("heal");
    expect(spec.addAbilityModToHeal).toBeUndefined();
  });

  it("reads dice-less when either the count or the faces is missing", () => {
    const cfg = { scaling: scaledConfig, concentrates: () => false };
    expect(catalogEffectSpec({ name: "X", effectKind: "damage", effectDiceCount: 8 }, cfg).dice).toBeUndefined();
    expect(catalogEffectSpec({ name: "X", effectKind: "damage", effectDiceFaces: 6 }, cfg).dice).toBeUndefined();
  });
});

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
      modifierSource: null,
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
