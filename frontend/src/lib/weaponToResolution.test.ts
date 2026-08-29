import { describe, expect, it } from "vitest";

import { weaponToResolution } from "@/lib/weaponToResolution";
import type { AttackEntry } from "@/lib/attackMath";

// Mirrors decorateWeaponRow's served output shape — a weapon row already
// carrying its decomposed to-hit/damage addends (#1235).
const LONGBOW: AttackEntry = {
  id: "inv-1",
  name: "Longbow",
  attackLabel: "+5",
  damageLabel: "1d8+3 piercing",
  attackSpec: { count: 1, faces: 20, modifier: 5 },
  damageSpec: { count: 1, faces: 8, modifier: 3 },
  damageType: "piercing",
  attackRollLabel: "Longbow attack",
  damageRollLabel: "Longbow damage (piercing)",
  logSource: "Longbow",
  damageRiders: [],
  attackComponents: { abilityMod: 3, proficiencyBonus: 2, rangedBonus: 0, attackRollBonus: 0, ability: "dexterity" },
  damageComponents: { abilityMod: 3, meleeDamageBonus: 0, ability: "dexterity" },
};

describe("weaponToResolution", () => {
  it("builds an action-cost descriptor carrying the served attack bonus, crit range, and Extra Attack count", () => {
    const resolution = weaponToResolution(LONGBOW, 19, 2);

    expect(resolution.source).toBe("Longbow");
    expect(resolution.cost).toEqual({ kind: "action", attacks: 2 });
    expect(resolution.toHit).toMatchObject({ bonus: 5, critRange: 19 });
  });

  it("echoes the served damage spec, type, and kind — never re-derives them", () => {
    const resolution = weaponToResolution(LONGBOW, 20, 1);

    expect(resolution.effect).toMatchObject({
      spec: { count: 1, faces: 8, modifier: 3 },
      damageType: "piercing",
      kind: "damage",
    });
  });

  it("defaults to an action-cost descriptor when no cost kind is given", () => {
    const resolution = weaponToResolution(LONGBOW, 20, 1);
    expect(resolution.cost.kind).toBe("action");
  });

  it("builds a bonusAction-cost descriptor for a bonus-action swing (off-hand/Flurry, #1845)", () => {
    const resolution = weaponToResolution(LONGBOW, 20, 1, "bonusAction");
    expect(resolution.cost).toEqual({ kind: "bonusAction", attacks: 1 });
  });

  it("populates toHit.components and effect.components from the served decomposition (#1830 review)", () => {
    const resolution = weaponToResolution(LONGBOW, 20, 1);

    expect(resolution.toHit?.components).toEqual({
      abilityMod: 3,
      proficiencyBonus: 2,
      rangedBonus: 0,
      attackRollBonus: 0,
      ability: "dexterity",
    });
    expect(resolution.effect?.components).toEqual({ abilityMod: 3, meleeDamageBonus: 0, ability: "dexterity" });
  });

  it("omits components entirely for the unarmed/improvised rows, which never carry a decomposition", () => {
    const unarmed: AttackEntry = { ...LONGBOW, attackComponents: undefined, damageComponents: undefined };

    const resolution = weaponToResolution(unarmed, 20, 1);

    expect(resolution.toHit).not.toHaveProperty("components");
    expect(resolution.effect).not.toHaveProperty("components");
  });
});
