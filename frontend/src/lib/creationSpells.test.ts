import { describe, it, expect } from "vitest";

import {
  creationSpellCounts,
  creationSpellsMissing,
  eligibleCreationCantrips,
  eligibleCreationSpells,
  toggleCreationPick,
} from "@/lib/creationSpells";
import type { CatalogSpell, ClassOption } from "@/types/character";

function spell(overrides: Partial<CatalogSpell>): CatalogSpell {
  return {
    id: "s",
    name: "Spell",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "",
    classes: ["warlock"],
    ...overrides,
  } as CatalogSpell;
}

const CATALOG: CatalogSpell[] = [
  spell({ id: "c1", level: 0, classes: ["warlock"] }),
  spell({ id: "c2", level: 0, classes: ["wizard"] }),
  spell({ id: "s1", level: 1, classes: ["warlock"] }),
  spell({ id: "s2", level: 1, classes: ["wizard"] }),
  spell({ id: "s3", level: 2, classes: ["warlock"] }),
];

describe("creationSpellCounts", () => {
  it("returns the class's level1SpellPicks, or null for a non-caster", () => {
    const caster = { level1SpellPicks: { cantrips: 2, spells: 2 } } as ClassOption;
    expect(creationSpellCounts(caster)).toEqual({ cantrips: 2, spells: 2 });
    expect(creationSpellCounts({ level1SpellPicks: null } as ClassOption)).toBeNull();
    expect(creationSpellCounts(undefined)).toBeNull();
  });
});

describe("eligibility — level 0/1 on the class list", () => {
  it("keeps only the class's cantrips", () => {
    expect(eligibleCreationCantrips(CATALOG, "Warlock").map((s) => s.id)).toEqual(["c1"]);
  });
  it("keeps only the class's level-1 spells (never cantrips or level 2)", () => {
    expect(eligibleCreationSpells(CATALOG, "warlock").map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("toggleCreationPick — add/remove with a cap", () => {
  it("adds up to the cap, then refuses more", () => {
    expect(toggleCreationPick([], "a", 2)).toEqual(["a"]);
    expect(toggleCreationPick(["a"], "b", 2)).toEqual(["a", "b"]);
    expect(toggleCreationPick(["a", "b"], "c", 2)).toEqual(["a", "b"]);
  });
  it("always allows deselecting", () => {
    expect(toggleCreationPick(["a", "b"], "a", 2)).toEqual(["b"]);
  });
});

describe("creationSpellsMissing — completeness labels", () => {
  it("names each incomplete list", () => {
    expect(creationSpellsMissing({ cantrips: 2, spells: 2 }, ["c1"], [])).toEqual([
      "Cantrips: choose 2",
      "Spells: choose 2",
    ]);
  });
  it("is empty when both lists match", () => {
    expect(creationSpellsMissing({ cantrips: 2, spells: 1 }, ["c1", "c2"], ["s1"])).toEqual([]);
  });
  it("is empty for a non-caster (null counts) regardless of stray picks", () => {
    expect(creationSpellsMissing(null, ["x"], ["y"])).toEqual([]);
  });
});
