import { describe, it, expect } from "vitest";

import {
  creationSpellCounts,
  creationSpellsMissing,
  splitCreationCatalog,
  toggleCreationPick,
} from "@/lib/creationSpells";
import type { CatalogSpell, ClassOption } from "@/types/character";

// The eligibility suite that used to sit here went with the functions it covered
// (#1377). GET /api/spells applies that rule now, and the guarantee is asserted
// in the spells route test plus the request-shape assertion in
// CreationSpellsStep.test.tsx.
describe("creationSpellCounts", () => {
  it("returns the class's level1SpellPicks, or null for a non-caster", () => {
    const caster = { level1SpellPicks: { cantrips: 2, spells: 2, maxSpellLevel: 1 } } as ClassOption;
    expect(creationSpellCounts(caster)).toEqual({ cantrips: 2, spells: 2, maxSpellLevel: 1 });
    expect(creationSpellCounts({ level1SpellPicks: null } as ClassOption)).toBeNull();
    expect(creationSpellCounts(undefined)).toBeNull();
  });
});

describe("splitCreationCatalog — grouping an already-eligible list", () => {
  const row = (id: string, level: number) => ({ id, level } as CatalogSpell);

  it("routes level 0 to cantrips and everything above it to spells", () => {
    const { cantrips, spells } = splitCreationCatalog([row("c", 0), row("s1", 1), row("s2", 2)]);
    expect(cantrips.map((s) => s.id)).toEqual(["c"]);
    // Level 2 is kept, not dropped: the level ceiling is the server's job, so
    // re-filtering here would be the client re-deriving the rule.
    expect(spells.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("treats a not-yet-loaded catalog as two empty groups", () => {
    expect(splitCreationCatalog(null)).toEqual({ cantrips: [], spells: [] });
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
    expect(creationSpellsMissing({ cantrips: 2, spells: 2, maxSpellLevel: 1 }, ["c1"], [])).toEqual([
      "Cantrips: choose 2",
      "Spells: choose 2",
    ]);
  });
  it("is empty when both lists match", () => {
    expect(creationSpellsMissing({ cantrips: 2, spells: 1, maxSpellLevel: 1 }, ["c1", "c2"], ["s1"])).toEqual([]);
  });
  it("is empty for a non-caster (null counts) regardless of stray picks", () => {
    expect(creationSpellsMissing(null, ["x"], ["y"])).toEqual([]);
  });
});
