// Pure unit tests for buildSpeciesTraitsView (#1682) — no database. Proves the
// collection logic in isolation: species-level traits (variantId: null) plus
// the picked variant's own traits, never a sibling variant's; a legacy
// `race`-name-only character (no species picked) resolves to empty, not a
// crash; the returned improvements are the flat, unevaluated FeatImprovement[]
// applyFeatLayer later feeds into the shared deriveImprovementBonuses/
// deriveImprovementProficiencies evaluator (this function does no summing).
import { describe, expect, it } from "vitest";

import { buildSpeciesTraitsView } from "../species.js";
import type { CharacterWithRelations } from "../../character-include.js";

function fakeRow(raceSelection: unknown): CharacterWithRelations {
  return { raceSelection } as unknown as CharacterWithRelations;
}

describe("buildSpeciesTraitsView (#1682)", () => {
  it("returns [] traits and [] improvements for a legacy race-name-only character (no species picked)", () => {
    const row = fakeRow({ name: "Hill Dwarf", species: null, variant: null });
    expect(buildSpeciesTraitsView(row)).toEqual({ traits: [], improvements: [] });
  });

  it("collects species-level traits (variantId: null) plus the picked variant's own traits, never a sibling variant's", () => {
    const row = fakeRow({
      name: "Hill Dwarf",
      species: {
        traits: [
          { name: "Darkvision", description: "60 ft. (SRD 5.1)", variantId: null, improvements: [] },
          { name: "Dwarven Toughness", description: "Hill-only.", variantId: "hill-id", improvements: [{ target: "maxHp", amount: 1, perLevel: true }] },
          { name: "Dwarven Armor Training", description: "Mountain-only.", variantId: "mountain-id", improvements: [{ target: "armorProficiency", amount: 1, key: "light" }] },
        ],
      },
      variant: {
        id: "hill-id",
        traits: [
          { name: "Dwarven Toughness", description: "Hill-only.", variantId: "hill-id", improvements: [{ target: "maxHp", amount: 1, perLevel: true }] },
        ],
      },
    });

    const view = buildSpeciesTraitsView(row);
    expect(view.traits.map((t) => t.name).sort()).toEqual(["Darkvision", "Dwarven Toughness"].sort());
    // The Mountain-only row never leaks in for a Hill Dwarf character.
    expect(view.traits.some((t) => t.name === "Dwarven Armor Training")).toBe(false);
    expect(view.improvements).toEqual([{ target: "maxHp", amount: 1, perLevel: true }]);
  });

  it("a variantless species (e.g. Human) yields only its species-level traits", () => {
    const row = fakeRow({
      name: "Human",
      species: { traits: [{ name: "Resourceful", description: "Long rest. (SRD 5.2)", variantId: null, improvements: [] }] },
      variant: null,
    });
    const view = buildSpeciesTraitsView(row);
    expect(view.traits).toEqual([{ name: "Resourceful", description: "Long rest. (SRD 5.2)" }]);
    expect(view.improvements).toEqual([]);
  });
});
