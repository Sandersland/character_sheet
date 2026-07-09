import { describe, it, expect } from "vitest";

import {
  buildInput,
  currencyFromForm,
  emptyForm,
  formFromItem,
  hasRange,
  num,
  str,
  unitForCost,
  weaponFields,
  type FormState,
} from "@/lib/campaignItemForm";
import type { CampaignItem, WeaponDetail } from "@/types/character";

const form = (over: Partial<FormState> = {}): FormState => ({ ...emptyForm, ...over });

const weapon = (over: Partial<WeaponDetail> = {}): WeaponDetail => ({
  damageDiceCount: 1,
  damageDiceFaces: 6,
  damageModifier: 0,
  damageType: "bludgeoning",
  finesse: false,
  light: false,
  heavy: false,
  twoHanded: false,
  reach: false,
  thrown: false,
  ammunition: false,
  ...over,
});

describe("num / str", () => {
  it("num parses numeric strings and returns undefined for blank/NaN", () => {
    expect(num("42")).toBe(42);
    expect(num("  ")).toBeUndefined();
    expect(num("")).toBeUndefined();
    expect(num("abc")).toBeUndefined();
  });

  it("str round-trips a number and blanks undefined", () => {
    expect(str(7)).toBe("7");
    expect(str(0)).toBe("0");
    expect(str(undefined)).toBe("");
  });
});

describe("unitForCost", () => {
  it("defaults to gp for a blank cost", () => {
    expect(unitForCost(undefined)).toBe("gp");
    expect(unitForCost({ cp: 0, sp: 0, gp: 0, pp: 0 })).toBe("gp");
  });

  it("picks the highest populated denomination", () => {
    expect(unitForCost({ cp: 0, sp: 50, gp: 0, pp: 0 })).toBe("sp");
    expect(unitForCost({ cp: 5, sp: 0, gp: 0, pp: 1 })).toBe("pp");
  });
});

describe("currencyFromForm", () => {
  it("returns undefined when every denomination is blank", () => {
    expect(currencyFromForm(form())).toBeUndefined();
  });

  it("fills unset denominations with 0 when at least one is set", () => {
    expect(currencyFromForm(form({ costGp: "200" }))).toEqual({ cp: 0, sp: 0, gp: 200, pp: 0 });
  });
});

describe("hasRange", () => {
  it("is true only for a ranged or thrown weapon", () => {
    expect(hasRange(form())).toBe(false);
    expect(hasRange(form({ thrown: true }))).toBe(true);
    expect(hasRange(form({ weaponRange: "ranged" }))).toBe(true);
    expect(hasRange(form({ weaponRange: "melee" }))).toBe(false);
  });
});

describe("weaponFields", () => {
  it("falls back to empty-form defaults for a missing detail", () => {
    const w = weaponFields(undefined);
    expect(w.damageDiceCount).toBe(emptyForm.damageDiceCount);
    expect(w.damageType).toBe(emptyForm.damageType);
    expect(w.versatile).toBe(false);
    expect(w.finesse).toBe(false);
  });

  it("marks versatile when either versatile die field is present", () => {
    expect(weaponFields(weapon({ versatileDiceFaces: 8 })).versatile).toBe(true);
  });
});

describe("buildInput weapon", () => {
  it("drops versatile and range when their gates are off", () => {
    const out = buildInput(
      form({ name: "Club", versatileDiceCount: "1", versatileDiceFaces: "10", rangeNormal: "20", rangeLong: "60" }),
    );
    expect(out.weapon?.versatileDiceCount).toBeUndefined();
    expect(out.weapon?.versatileDiceFaces).toBeUndefined();
    expect(out.weapon?.rangeNormal).toBeUndefined();
    expect(out.weapon?.rangeLong).toBeUndefined();
  });

  it("keeps range when thrown is on", () => {
    const out = buildInput(form({ name: "Handaxe", thrown: true, rangeNormal: "20", rangeLong: "60" }));
    expect(out.weapon?.rangeNormal).toBe(20);
    expect(out.weapon?.rangeLong).toBe(60);
  });
});

describe("buildInput magic gating", () => {
  it("clears attunement/unique/capabilities when rarity is mundane", () => {
    const out = buildInput(
      form({ name: "Ring", rarity: "", requiresAttunement: true, isUnique: true, capabilities: [] }),
    );
    expect(out.requiresAttunement).toBe(false);
    expect(out.isUnique).toBe(false);
    expect(out.attunementPrereqKind).toBeNull();
    expect(out.attunementPrereqValue).toBeNull();
    expect(out.capabilities).toEqual([]);
  });

  it("degrades a value-bearing prereq kind with no value to null", () => {
    const out = buildInput(
      form({ name: "Staff", rarity: "RARE", requiresAttunement: true, attunementPrereqKind: "class", attunementPrereqValue: "  " }),
    );
    expect(out.attunementPrereqKind).toBe("class");
    expect(out.attunementPrereqValue).toBeNull();
  });

  it("omits the prereq value for a spellcaster kind", () => {
    const out = buildInput(
      form({ name: "Staff", rarity: "RARE", requiresAttunement: true, attunementPrereqKind: "spellcaster", attunementPrereqValue: "x" }),
    );
    expect(out.attunementPrereqValue).toBeNull();
  });
});

describe("buildInput category shaping", () => {
  it("nulls the slot for a non-gear category and keeps it for gear", () => {
    expect(buildInput(form({ name: "Sword", category: "weapon", slot: "RING" })).slot).toBeNull();
    expect(buildInput(form({ name: "Ring", category: "gear", slot: "RING" })).slot).toBe("RING");
    expect(buildInput(form({ name: "Rope", category: "gear", slot: "" })).slot).toBeNull();
  });

  it("omits a consumable effect block when every effect field is blank", () => {
    expect(buildInput(form({ name: "Water", category: "consumable" })).consumable).toBeUndefined();
  });

  it("includes a consumable effect block when any field is set", () => {
    const out = buildInput(form({ name: "Potion", category: "consumable", effectDiceCount: "2", effectDiceFaces: "4" }));
    expect(out.consumable).toEqual({ effectDiceCount: 2, effectDiceFaces: 4, effectModifier: undefined, effectDescription: undefined });
  });
});

describe("formFromItem", () => {
  const base: CampaignItem = {
    id: "i1",
    campaignId: "c1",
    name: "Flametongue",
    category: "weapon",
    requiresAttunement: false,
    isUnique: false,
    holders: [],
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
  };

  it("prefills weapon detail and versatile/range flags", () => {
    const f = formFromItem({
      ...base,
      weapon: weapon({ damageModifier: 2, damageType: "piercing", versatileDiceFaces: 8, thrown: true, rangeNormal: 20 }),
    });
    expect(f.damageModifier).toBe("2");
    expect(f.versatile).toBe(true);
    expect(f.versatileDiceFaces).toBe("8");
    expect(f.thrown).toBe(true);
    expect(f.rangeNormal).toBe("20");
  });

  it("shows a non-gp cost's highest denomination in valueUnit", () => {
    const f = formFromItem({ ...base, cost: { cp: 0, sp: 50, gp: 0, pp: 0 } });
    expect(f.valueUnit).toBe("sp");
    expect(f.costSp).toBe("50");
  });
});
