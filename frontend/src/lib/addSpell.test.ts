import { describe, it, expect } from "vitest";

import {
  catalogEffectLine,
  catalogMetaLine,
  filterCatalog,
} from "@/lib/addSpell";
import type { CatalogSpell } from "@/types/character";

function catalogSpell(over: Partial<CatalogSpell>): CatalogSpell {
  return {
    id: "c1",
    name: "Fireball",
    level: 3,
    school: "evocation",
    castingTime: "1 action",
    range: "150 ft",
    duration: "Instantaneous",
    description: "",
    concentration: false,
    ritual: false,
    classes: [],
    cantripScaling: false,
    ...over,
  };
}

const catalog: CatalogSpell[] = [
  catalogSpell({ id: "a", name: "Fireball", level: 3, school: "evocation" }),
  catalogSpell({ id: "b", name: "Cure Wounds", level: 1, school: "evocation" }),
  catalogSpell({ id: "c", name: "Mage Hand", level: 0, school: "conjuration" }),
];

describe("filterCatalog", () => {
  it("returns everything with no filters", () => {
    expect(filterCatalog(catalog, "", "")).toHaveLength(3);
  });

  it("filters by exact level string", () => {
    const out = filterCatalog(catalog, "", "0");
    expect(out.map((s) => s.id)).toEqual(["c"]);
  });

  it("matches name case-insensitively", () => {
    expect(filterCatalog(catalog, "fire", "").map((s) => s.id)).toEqual(["a"]);
  });

  it("matches on school text too", () => {
    expect(filterCatalog(catalog, "conjuration", "").map((s) => s.id)).toEqual(["c"]);
  });

  it("combines search and level (both must match)", () => {
    expect(filterCatalog(catalog, "wounds", "3")).toEqual([]);
  });

  it("tolerates a null catalog", () => {
    expect(filterCatalog(null, "", "")).toEqual([]);
  });
});

describe("catalogMetaLine", () => {
  it("labels a cantrip and appends conc/ritual flags", () => {
    expect(catalogMetaLine(catalogSpell({ level: 0, school: "conjuration", concentration: true, ritual: true })))
      .toBe("Cantrip · conjuration · conc · ritual");
  });

  it("omits flags when absent", () => {
    expect(catalogMetaLine(catalogSpell({ level: 3, school: "evocation" }))).toBe("Level 3 · evocation");
  });
});

describe("catalogEffectLine", () => {
  it("returns null for a utility spell", () => {
    expect(catalogEffectLine(catalogSpell({}))).toBeNull();
  });

  it("formats damage with type + modifier", () => {
    expect(catalogEffectLine(catalogSpell({ effectKind: "damage", damageType: "fire", effectDiceCount: 8, effectDiceFaces: 6, effectModifier: 2 })))
      .toBe("fire damage — 8d6 + 2");
  });

  it("labels a heal as Healing and omits a zero modifier", () => {
    expect(catalogEffectLine(catalogSpell({ effectKind: "heal", effectDiceCount: 2, effectDiceFaces: 4 })))
      .toBe("Healing — 2d4");
  });

  it("returns null when the effect has no dice (Mage Armor-style buffs)", () => {
    expect(catalogEffectLine(catalogSpell({ effectKind: "damage" }))).toBeNull();
  });

  describe("multi-instance spells (#1981/#1984)", () => {
    it("prefixes 'N × ' when instanceCount is greater than 1 (Scorching Ray)", () => {
      expect(
        catalogEffectLine(
          catalogSpell({ effectKind: "damage", damageType: "fire", effectDiceCount: 2, effectDiceFaces: 6, instanceCount: 3 }),
        ),
      ).toBe("fire damage — 3 × 2d6");
    });

    it("does not prefix when instanceCount is exactly 1 (Eldritch Blast's base beam)", () => {
      expect(
        catalogEffectLine(
          catalogSpell({ effectKind: "damage", damageType: "force", effectDiceCount: 1, effectDiceFaces: 10, instanceCount: 1 }),
        ),
      ).toBe("force damage — 1d10");
    });

    it("does not prefix an un-instanced spell", () => {
      expect(catalogEffectLine(catalogSpell({ effectKind: "damage", damageType: "fire", effectDiceCount: 8, effectDiceFaces: 6 })))
        .toBe("fire damage — 8d6");
    });

    it("keeps the modifier after the instance prefix", () => {
      expect(
        catalogEffectLine(
          catalogSpell({ effectKind: "damage", damageType: "force", effectDiceCount: 1, effectDiceFaces: 4, effectModifier: 1, instanceCount: 3 }),
        ),
      ).toBe("force damage — 3 × 1d4 + 1");
    });
  });
});
