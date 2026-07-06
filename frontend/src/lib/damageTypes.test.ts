import { describe, it, expect } from "vitest";

import { activeResistedDamageTypes, damageTypeLabel, DAMAGE_TYPES } from "@/lib/damageTypes";
import type { ActiveBuff } from "@/types/character";

function buff(partial: Partial<ActiveBuff>): ActiveBuff {
  return {
    id: "x",
    key: "k",
    target: "meleeDamage",
    modifier: 0,
    source: "S",
    duration: "while-active",
    ...partial,
  };
}

describe("DAMAGE_TYPES", () => {
  it("covers the 13 standard 5e damage types", () => {
    expect(DAMAGE_TYPES).toHaveLength(13);
    expect(DAMAGE_TYPES).toContain("slashing");
    expect(DAMAGE_TYPES).toContain("fire");
  });
});

describe("damageTypeLabel", () => {
  it("title-cases a type", () => {
    expect(damageTypeLabel("slashing")).toBe("Slashing");
  });
});

describe("activeResistedDamageTypes (#456)", () => {
  it("returns an empty set when no buffs declare resistances", () => {
    expect(activeResistedDamageTypes([])).toEqual(new Set());
    expect(activeResistedDamageTypes([buff({})])).toEqual(new Set());
  });

  it("unions resistDamageTypes across buffs", () => {
    const result = activeResistedDamageTypes([
      buff({ key: "rage", resistDamageTypes: ["bludgeoning", "piercing", "slashing"] }),
      buff({ key: "other", resistDamageTypes: ["piercing", "fire"] }),
    ]);
    expect(result).toEqual(new Set(["bludgeoning", "piercing", "slashing", "fire"]));
  });
});
