import { describe, it, expect } from "vitest";

import { computeCastSpec, planCast } from "@/lib/spellCast";
import { effectPreview, effectPreviewWithMod } from "@/lib/spellMeta";
import type { Character, Spell } from "@/types/character";

function spell(overrides: Partial<Spell>): Spell {
  return {
    id: "s",
    name: "Spell",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    description: "",
    ...overrides,
  } as Spell;
}

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Tester",
    level: 1,
    abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 16, charisma: 10 },
    spellcasting: { ability: "wisdom" },
    ...overrides,
  } as unknown as Character;
}

const fireball = spell({
  name: "Fireball",
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
});

const scalingCantrip = spell({
  name: "Fire Bolt",
  level: 0,
  effectKind: "damage",
  effectDiceCount: 1,
  effectDiceFaces: 10,
  damageType: "fire",
  attackType: "attack",
  cantripScaling: true,
});

const healSpell = spell({
  name: "Cure Wounds",
  level: 1,
  effectKind: "heal",
  effectDiceCount: 2,
  effectDiceFaces: 4,
  effectModifier: 0,
});

const utilitySpell = spell({ name: "Detect Magic", level: 1 });

describe("computeCastSpec — golden characterization (pre-refactor byte-parity)", () => {
  it("Fireball upcast at slot 5 adds upcastDicePerLevel per extra level", () => {
    expect(computeCastSpec(fireball, character(), 5)).toEqual({ count: 10, faces: 6, modifier: 0 });
  });

  it("scaling cantrip counts 1/2/3/4 at char level 1/5/11/17", () => {
    expect(computeCastSpec(scalingCantrip, character({ level: 1 }), 0)).toEqual({ count: 1, faces: 10, modifier: 0 });
    expect(computeCastSpec(scalingCantrip, character({ level: 5 }), 0)).toEqual({ count: 2, faces: 10, modifier: 0 });
    expect(computeCastSpec(scalingCantrip, character({ level: 11 }), 0)).toEqual({ count: 3, faces: 10, modifier: 0 });
    expect(computeCastSpec(scalingCantrip, character({ level: 17 }), 0)).toEqual({ count: 4, faces: 10, modifier: 0 });
  });

  it("heal adds the spellcasting ability modifier; damage does not", () => {
    expect(computeCastSpec(healSpell, character(), 1)).toEqual({ count: 2, faces: 4, modifier: 3 });
    expect(computeCastSpec(fireball, character(), 3)).toEqual({ count: 8, faces: 6, modifier: 0 });
  });

  it("utility spell with no effect dice returns null", () => {
    expect(computeCastSpec(utilitySpell, character(), 1)).toBeNull();
  });
});

describe("planCast — ops + banner without React state", () => {
  it("cantrip damage: one roll op, no slot level, banner without slotLevel", () => {
    const plan = planCast(scalingCantrip, character({ level: 5 }));
    expect(plan.ops).toEqual([{ type: "castSpell", entryId: "s", roll: expect.any(Number) }]);
    expect(plan.result).toMatchObject({ effectKind: "damage", diceStr: "2d10", slotLevel: undefined });
  });

  it("leveled damage at an explicit slot: op + banner carry that slot level", () => {
    const plan = planCast(fireball, character(), 5);
    expect(plan.ops[0]).toMatchObject({ type: "castSpell", entryId: "s", slotLevel: 5 });
    expect(plan.result).toMatchObject({ diceStr: "10d6", slotLevel: 5 });
  });

  it("leveled damage with no explicit slot defaults the op to the spell level", () => {
    const plan = planCast(fireball, character());
    expect(plan.ops[0]).toMatchObject({ slotLevel: 3 });
    expect(plan.result?.slotLevel).toBeUndefined();
  });

  it("heal spell reports a heal banner", () => {
    expect(planCast(healSpell, character(), 1).result).toMatchObject({ effectKind: "heal" });
  });

  it("leveled utility spell: expends the slot (roll 0) with no banner", () => {
    const plan = planCast(utilitySpell, character(), 1);
    expect(plan.ops).toEqual([{ type: "castSpell", entryId: "s", slotLevel: 1, roll: 0 }]);
    expect(plan.result).toBeNull();
  });

  it("cantrip utility spell: no ops and no banner", () => {
    const plan = planCast(spell({ level: 0 }), character());
    expect(plan.ops).toEqual([]);
    expect(plan.result).toBeNull();
  });

  it("item-granted spell casts via castItemSpell at the item's cast level", () => {
    const itemSpell = spell({ id: "i", source: "item", level: 3, item: { castLevel: 5 } } as Partial<Spell>);
    const plan = planCast({ ...itemSpell, ...fireball, id: "i", source: "item", item: { castLevel: 5 } } as Spell, character());
    expect(plan.ops[0]).toMatchObject({ type: "castItemSpell", entryId: "i" });
    expect(plan.result).toMatchObject({ diceStr: "10d6" });
  });
});

describe("spellMeta previews — golden string snapshots", () => {
  it("effectPreview strings", () => {
    expect(effectPreview(fireball, 1, 5)).toBe("10d6 fire");
    expect(effectPreview(scalingCantrip, 1)).toBe("1d10 fire");
    expect(effectPreview(scalingCantrip, 5)).toBe("2d10 fire");
    expect(effectPreview(scalingCantrip, 11)).toBe("3d10 fire");
    expect(effectPreview(scalingCantrip, 17)).toBe("4d10 fire");
    expect(effectPreview(healSpell, 1)).toBe("2d4 healing");
    expect(effectPreview(utilitySpell, 1)).toBeNull();
  });

  it("effectPreviewWithMod strings", () => {
    expect(effectPreviewWithMod(fireball, character(), 5)).toBe("10d6 fire");
    expect(effectPreviewWithMod(healSpell, character(), 1)).toBe("2d4 + 3 healing");
    expect(effectPreviewWithMod(scalingCantrip, character({ level: 11 }))).toBe("3d10 fire");
    expect(effectPreviewWithMod(utilitySpell, character(), 1)).toBeNull();
  });
});
