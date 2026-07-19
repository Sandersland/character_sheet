import { describe, it, expect } from "vitest";

import {
  BLANK_CUSTOM,
  buildCustomSpellPayload,
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
});

describe("buildCustomSpellPayload", () => {
  it("trims the name and carries the core fields", () => {
    const payload = buildCustomSpellPayload({ ...BLANK_CUSTOM, name: "  Zap  " }, false);
    expect(payload.name).toBe("Zap");
    expect(payload.level).toBe(0);
    expect(payload.effectKind).toBeUndefined();
  });

  it("omits effect fields when hasEffect is false even if set", () => {
    const payload = buildCustomSpellPayload(
      { ...BLANK_CUSTOM, name: "Zap", effectKind: "damage", effectDiceCount: 4 },
      false,
    );
    expect(payload.effectKind).toBeUndefined();
    expect(payload.effectDiceCount).toBeUndefined();
  });

  it("omits effect fields when hasEffect is true but no effectKind chosen", () => {
    const payload = buildCustomSpellPayload({ ...BLANK_CUSTOM, name: "Zap", effectDiceCount: 4 }, true);
    expect(payload.effectKind).toBeUndefined();
    expect(payload.effectDiceCount).toBeUndefined();
  });

  it("includes effect fields when hasEffect is true and a kind is chosen", () => {
    const payload = buildCustomSpellPayload(
      {
        ...BLANK_CUSTOM,
        name: "Zap",
        effectKind: "damage",
        effectDiceCount: 8,
        effectDiceFaces: 6,
        damageType: "fire",
      },
      true,
    );
    expect(payload.effectKind).toBe("damage");
    expect(payload.effectDiceCount).toBe(8);
    expect(payload.damageType).toBe("fire");
  });
});
