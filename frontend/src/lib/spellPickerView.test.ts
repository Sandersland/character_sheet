import { describe, it, expect } from "vitest";

import {
  budgetHeadline,
  componentsLine,
  effectPillLabel,
  pickDetailCtaLabel,
  pickerMetaLine,
  pickRowState,
  spellResolutionLabel,
} from "@/lib/spellPickerView";
import type { CatalogSpell } from "@/types/character";

function spell(over: Partial<CatalogSpell>): CatalogSpell {
  return {
    id: "c1",
    name: "Spell",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 ft.",
    duration: "Instantaneous",
    description: "",
    concentration: false,
    ritual: false,
    classes: [],
    cantripScaling: false,
    ...over,
  };
}

describe("pickRowState", () => {
  const known: ReadonlySet<string> = new Set(["k"]);

  it("marks a known spell disabled", () => {
    expect(pickRowState(spell({ id: "k" }), known, [], false)).toEqual({ state: "known", disabled: true });
  });

  it("keeps a selected spell pressed and toggleable even at cap", () => {
    expect(pickRowState(spell({ id: "s" }), known, ["s"], true)).toEqual({ state: "selected", disabled: false });
  });

  it("disables an unselected spell once the cap is hit", () => {
    expect(pickRowState(spell({ id: "u" }), known, ["s"], true)).toEqual({ state: "select", disabled: true });
  });

  it("leaves an unselected spell selectable below the cap", () => {
    expect(pickRowState(spell({ id: "u" }), known, [], false)).toEqual({ state: "select", disabled: false });
  });
});

describe("budgetHeadline", () => {
  it("joins the groups with a middot", () => {
    expect(
      budgetHeadline([
        { label: "Cantrips", selected: 1, cap: 2 },
        { label: "Spells", selected: 0, cap: 2 },
      ]),
    ).toBe("Cantrips 1/2 · Spells 0/2");
  });

  it("pins a single group with no separator", () => {
    expect(budgetHeadline([{ label: "Cantrips", selected: 1, cap: 2 }])).toBe("Cantrips 1/2");
  });

  it("drops zero-cap groups", () => {
    expect(
      budgetHeadline([
        { label: "Cantrips", selected: 0, cap: 0 },
        { label: "Spells", selected: 2, cap: 2 },
      ]),
    ).toBe("Spells 2/2");
  });
});

describe("pickerMetaLine", () => {
  it("labels a cantrip", () => {
    expect(pickerMetaLine(spell({ level: 0, castingTime: "1 action", range: "60 ft." }))).toBe(
      "Cantrip · 1 action · 60 ft.",
    );
  });

  it("labels a leveled spell", () => {
    expect(pickerMetaLine(spell({ level: 1, castingTime: "1 action", range: "Self" }))).toBe(
      "Level 1 · 1 action · Self",
    );
  });
});

describe("effectPillLabel", () => {
  it("describes damage", () => {
    expect(
      effectPillLabel(spell({ effectKind: "damage", effectDiceCount: 8, effectDiceFaces: 6, damageType: "fire" })),
    ).toBe("fire damage — 8d6");
  });

  it("describes healing", () => {
    expect(effectPillLabel(spell({ effectKind: "heal", effectDiceCount: 2, effectDiceFaces: 4 }))).toBe(
      "Healing — 2d4",
    );
  });

  it("is null for a diceless effect", () => {
    expect(effectPillLabel(spell({ effectKind: "buff" }))).toBeNull();
  });
});

describe("componentsLine", () => {
  it("comma-joins the present components", () => {
    expect(componentsLine({ components: { verbal: true, somatic: true, material: true } })).toBe("V, S, M");
  });

  it("returns only the present subset", () => {
    expect(componentsLine({ components: { verbal: true, somatic: false, material: true } })).toBe("V, M");
  });

  it("is null without components", () => {
    expect(componentsLine({ components: null })).toBeNull();
    expect(componentsLine({})).toBeNull();
  });
});

describe("pickDetailCtaLabel", () => {
  it("reads 'already known' for a known spell, disabled or not", () => {
    expect(pickDetailCtaLabel("Fire Bolt", "known", true, 2, 0, "Learn")).toBe("Fire Bolt is already known");
  });

  it("reads 'Remove' for a selected spell even at cap", () => {
    expect(pickDetailCtaLabel("Fire Bolt", "selected", false, 2, 2, "Learn")).toBe("Remove Fire Bolt");
  });

  it("drops the count once the group is at cap and unselected", () => {
    expect(pickDetailCtaLabel("Fire Bolt", "select", true, 2, 2, "Learn")).toBe("Learn Fire Bolt");
  });

  it("shows the next-of-cap count below cap", () => {
    expect(pickDetailCtaLabel("Fire Bolt", "select", false, 2, 0, "Learn")).toBe("Learn Fire Bolt · 1 of 2");
  });
});

describe("spellResolutionLabel", () => {
  it("names the save ability and half-on-success", () => {
    expect(spellResolutionLabel({ attackType: "save", saveAbility: "dexterity", saveEffect: "half" })).toBe(
      "DEX save · half on success",
    );
  });

  it("drops the half clause when the save negates fully", () => {
    expect(spellResolutionLabel({ attackType: "save", saveAbility: "wisdom", saveEffect: "none" })).toBe("WIS save");
  });

  it("labels a spell attack", () => {
    expect(spellResolutionLabel({ attackType: "attack" })).toBe("Spell attack");
  });

  it("is null when the spell neither attacks nor forces a save", () => {
    expect(spellResolutionLabel({ attackType: null })).toBeNull();
    expect(spellResolutionLabel({ attackType: "save", saveAbility: null })).toBeNull();
  });
});
