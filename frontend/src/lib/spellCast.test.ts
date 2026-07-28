import { describe, it, expect } from "vitest";

import { computeCastSpec, planCast } from "@/lib/spellCast";
import type { Spell } from "@/types/character";

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

// #1381: fixtures now carry served effectRolls (the backend's resolved rolls)
// instead of raw effect columns — computeCastSpec/planCast are lookups, not
// rule re-derivations. The cantrip-scaling-across-levels and heal-modifier
// GOLDEN cases that used to live here migrated to the backend test that
// proves the rule (spell-effect-rolls.test.ts) — this file only pins the
// lookup mechanics.
const fireball = spell({
  name: "Fireball",
  level: 3,
  effectKind: "damage",
  damageType: "fire",
  attackType: "save",
  saveAbility: "dexterity",
  saveEffect: "half",
  effectRolls: [
    { slotLevel: 3, roll: { count: 8, faces: 6, modifier: 0 } },
    { slotLevel: 5, roll: { count: 10, faces: 6, modifier: 0 } },
  ],
});

const scalingCantrip = spell({
  name: "Fire Bolt",
  level: 0,
  effectKind: "damage",
  damageType: "fire",
  attackType: "attack",
  effectRolls: [{ slotLevel: 0, roll: { count: 2, faces: 10, modifier: 0 } }],
});

const healSpell = spell({
  name: "Cure Wounds",
  level: 1,
  effectKind: "heal",
  effectRolls: [{ slotLevel: 1, roll: { count: 2, faces: 4, modifier: 3 } }],
});

const utilitySpell = spell({ name: "Detect Magic", level: 1 });

describe("computeCastSpec — a lookup into the served effectRolls (#1381)", () => {
  it("computeCastSpec is a lookup into the served effectRolls", () => {
    expect(computeCastSpec(fireball, 5)).toEqual({ count: 10, faces: 6, modifier: 0 });
  });

  it("a spell with no served roll at that level yields null", () => {
    expect(computeCastSpec(fireball, 4)).toBeNull();
  });

  it("a cantrip is looked up at slotLevel 0", () => {
    expect(computeCastSpec(scalingCantrip, 0)).toEqual({ count: 2, faces: 10, modifier: 0 });
  });

  it("utility spell with no served roll returns null", () => {
    expect(computeCastSpec(utilitySpell, 1)).toBeNull();
  });
});

describe("planCast — ops + banner without React state", () => {
  it("cantrip damage: one roll op, no slot level, banner without slotLevel", () => {
    const plan = planCast(scalingCantrip);
    expect(plan.ops).toEqual([{ type: "castSpell", entryId: "s", roll: expect.any(Number) }]);
    expect(plan.result).toMatchObject({ effectKind: "damage", diceStr: "2d10", slotLevel: undefined });
  });

  it("leveled damage at an explicit slot: op + banner carry that slot level", () => {
    const plan = planCast(fireball, 5);
    expect(plan.ops[0]).toMatchObject({ type: "castSpell", entryId: "s", slotLevel: 5 });
    expect(plan.result).toMatchObject({ diceStr: "10d6", slotLevel: 5 });
  });

  it("leveled damage with no explicit slot defaults the op to the spell level", () => {
    const plan = planCast(fireball);
    expect(plan.ops[0]).toMatchObject({ slotLevel: 3 });
    expect(plan.result?.slotLevel).toBeUndefined();
  });

  it("heal spell reports a heal banner", () => {
    expect(planCast(healSpell, 1).result).toMatchObject({ effectKind: "heal" });
  });

  it("leveled utility spell: expends the slot (roll 0) with no banner", () => {
    const plan = planCast(utilitySpell, 1);
    expect(plan.ops).toEqual([{ type: "castSpell", entryId: "s", slotLevel: 1, roll: 0 }]);
    expect(plan.result).toBeNull();
  });

  it("cantrip utility spell: no ops and no banner", () => {
    const plan = planCast(spell({ level: 0 }));
    expect(plan.ops).toEqual([]);
    expect(plan.result).toBeNull();
  });

  it("item-granted spell casts via castItemSpell at the item's cast level", () => {
    const itemSpell = spell({
      id: "i",
      source: "item",
      level: 3,
      item: { castLevel: 5 } as Spell["item"],
      effectKind: "damage",
      damageType: "fire",
      effectRolls: [{ slotLevel: 5, roll: { count: 10, faces: 6, modifier: 0 } }],
    });
    const plan = planCast(itemSpell);
    expect(plan.ops[0]).toMatchObject({ type: "castItemSpell", entryId: "i" });
    expect(plan.result).toMatchObject({ diceStr: "10d6" });
  });
});
