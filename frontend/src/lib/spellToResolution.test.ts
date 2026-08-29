import { describe, expect, it } from "vitest";

import { spellToResolution } from "@/lib/spellToResolution";
import type { Spell } from "@/types/character";

const STATS = { spellAttackBonus: 6, spellSaveDC: 14 };

const FIRE_BOLT: Spell = {
  id: "entry-fire-bolt",
  name: "Fire Bolt",
  level: 0,
  school: "evocation",
  castingTime: "1 action",
  range: "120 feet",
  duration: "Instantaneous",
  description: "",
  attackType: "attack",
  damageType: "fire",
  effectKind: "damage",
  castCost: "action",
  effectRolls: [{ slotLevel: 0, roll: { count: 1, faces: 10, modifier: 0 } }],
};

const SACRED_FLAME: Spell = {
  id: "entry-sacred-flame",
  name: "Sacred Flame",
  level: 0,
  school: "evocation",
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "",
  attackType: "save",
  saveAbility: "dexterity",
  damageType: "radiant",
  effectKind: "damage",
  castCost: "action",
  effectRolls: [{ slotLevel: 0, roll: { count: 1, faces: 8, modifier: 0 } }],
};

const MAGIC_MISSILE: Spell = {
  id: "entry-magic-missile",
  name: "Magic Missile",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  range: "120 feet",
  duration: "Instantaneous",
  description: "",
  effectKind: "damage",
  damageType: "force",
  castCost: "action",
  effectRolls: [
    { slotLevel: 1, roll: { count: 3, faces: 4, modifier: 3 } },
    { slotLevel: 2, roll: { count: 4, faces: 4, modifier: 4 } },
  ],
};

const DRUIDCRAFT: Spell = {
  id: "entry-druidcraft",
  name: "Druidcraft",
  level: 0,
  school: "transmutation",
  castingTime: "1 action",
  range: "30 feet",
  duration: "Instantaneous",
  description: "",
  castCost: "action",
  effectRolls: [],
};

const CURE_WOUNDS: Spell = {
  id: "entry-cure-wounds",
  name: "Cure Wounds",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  range: "Touch",
  duration: "Instantaneous",
  description: "",
  effectKind: "heal",
  castCost: "action",
  effectRolls: [
    { slotLevel: 1, roll: { count: 1, faces: 8, modifier: 4 } },
    { slotLevel: 2, roll: { count: 2, faces: 8, modifier: 4 } },
  ],
};

const BLESS_BONUS: Spell = {
  id: "entry-bless",
  name: "Bless",
  level: 1,
  school: "enchantment",
  castingTime: "1 bonus action",
  range: "30 feet",
  duration: "Concentration, up to 1 minute",
  description: "",
  castCost: "bonusAction",
  effectRolls: [],
};

describe("spellToResolution", () => {
  it("attack-roll shape: toHit from the served spellAttackBonus, literal crit range 20 (#1120)", () => {
    const resolution = spellToResolution(FIRE_BOLT, 0, STATS);

    expect(resolution.source).toBe("Fire Bolt");
    expect(resolution.cost).toEqual({ kind: "action" });
    expect(resolution.toHit).toEqual({ bonus: 6, critRange: 20 });
    expect(resolution.save).toBeUndefined();
    expect(resolution.effect).toMatchObject({
      spec: { count: 1, faces: 10, modifier: 0 },
      kind: "damage",
      damageType: "fire",
    });
  });

  it("saving-throw shape: save from the served spellSaveDC + the spell's own ability, no toHit", () => {
    const resolution = spellToResolution(SACRED_FLAME, 0, STATS);

    expect(resolution.toHit).toBeUndefined();
    expect(resolution.save).toEqual({ dc: 14, ability: "dexterity" });
    expect(resolution.effect).toMatchObject({ kind: "damage", damageType: "radiant" });
  });

  it("auto-hit shape (Magic Missile): neither toHit nor save, effect only, at the chosen slot level", () => {
    const resolution = spellToResolution(MAGIC_MISSILE, 2, STATS);

    expect(resolution.toHit).toBeUndefined();
    expect(resolution.save).toBeUndefined();
    expect(resolution.effect).toMatchObject({
      spec: { count: 4, faces: 4, modifier: 4 },
      kind: "damage",
      damageType: "force",
    });
  });

  it("no-roll utility shape (Druidcraft): no toHit/save/effect at all", () => {
    const resolution = spellToResolution(DRUIDCRAFT, 0, STATS);

    expect(resolution.toHit).toBeUndefined();
    expect(resolution.save).toBeUndefined();
    expect(resolution.effect).toBeUndefined();
  });

  it("heal shape: effect.kind is heal and damageType is omitted", () => {
    const resolution = spellToResolution(CURE_WOUNDS, 1, STATS);

    expect(resolution.effect).toMatchObject({ spec: { count: 1, faces: 8, modifier: 4 }, kind: "heal" });
    expect(resolution.effect).not.toHaveProperty("damageType");
  });

  it("resolves the upcast slot level's own served roll, never the base level's", () => {
    const resolution = spellToResolution(CURE_WOUNDS, 2, STATS);

    expect(resolution.effect).toMatchObject({ spec: { count: 2, faces: 8, modifier: 4 } });
  });

  it("maps a served bonus-action castCost to cost.kind bonusAction", () => {
    const resolution = spellToResolution(BLESS_BONUS, 1, STATS);

    expect(resolution.cost).toEqual({ kind: "bonusAction" });
  });

  it("defaults cost.kind to action when castCost is absent (legacy/no-cost spell)", () => {
    const noCastCost: Spell = { ...DRUIDCRAFT, castCost: undefined };

    expect(spellToResolution(noCastCost, 0, STATS).cost).toEqual({ kind: "action" });
  });

  it("a broken save spell (attackType save, no saveAbility) resolves to a bare no-roll shape — never a false auto-hit", () => {
    const brokenSaveSpell: Spell = { ...SACRED_FLAME, saveAbility: null };

    const resolution = spellToResolution(brokenSaveSpell, 0, STATS);

    expect(resolution.toHit).toBeUndefined();
    expect(resolution.save).toBeUndefined();
    expect(resolution.effect).toBeUndefined();
  });
});
