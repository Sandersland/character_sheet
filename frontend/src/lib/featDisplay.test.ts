import { describe, expect, it } from "vitest";

import { abilityScorePreviews, featAbilityChipLabel } from "@/lib/featDisplay";
import type { CatalogFeat } from "@/types/character";

function feat(partial: Partial<CatalogFeat>): CatalogFeat {
  return {
    id: "f",
    name: "Feat",
    description: "",
    abilityOptions: [],
    abilityIncrease: 0,
    improvements: [],
    ...partial,
  };
}

describe("featAbilityChipLabel", () => {
  it("returns null for a full feat", () => {
    expect(featAbilityChipLabel(feat({ abilityOptions: [] }))).toBeNull();
  });

  it("formats a single option", () => {
    expect(featAbilityChipLabel(feat({ abilityOptions: ["charisma"], abilityIncrease: 1 }))).toBe("+1 Cha");
  });

  it("joins two options with 'or'", () => {
    expect(featAbilityChipLabel(feat({ abilityOptions: ["strength", "dexterity"], abilityIncrease: 1 }))).toBe(
      "+1 Str or Dex",
    );
  });

  it("joins three options with commas and a trailing 'or'", () => {
    expect(
      featAbilityChipLabel(feat({ abilityOptions: ["strength", "dexterity", "constitution"], abilityIncrease: 1 })),
    ).toBe("+1 Str, Dex or Con");
  });

  it("respects abilityIncrease", () => {
    expect(featAbilityChipLabel(feat({ abilityOptions: ["constitution"], abilityIncrease: 2 }))).toBe("+2 Con");
  });

  it("degrades gracefully on an unknown ability key", () => {
    expect(() => featAbilityChipLabel(feat({ abilityOptions: ["mystery"], abilityIncrease: 1 }))).not.toThrow();
    expect(featAbilityChipLabel(feat({ abilityOptions: ["mystery"], abilityIncrease: 1 }))).toContain("+1");
  });
});

describe("abilityScorePreviews", () => {
  it("returns ordered previews with full labels and before/after scores", () => {
    const previews = abilityScorePreviews(
      feat({ abilityOptions: ["constitution"], abilityIncrease: 1 }),
      { constitution: 16 },
    );
    expect(previews).toEqual([{ key: "constitution", label: "Constitution", before: 16, after: 17 }]);
  });

  it("defaults a missing score to 10", () => {
    const previews = abilityScorePreviews(
      feat({ abilityOptions: ["wisdom"], abilityIncrease: 1 }),
      {},
    );
    expect(previews).toEqual([{ key: "wisdom", label: "Wisdom", before: 10, after: 11 }]);
  });

  it("preserves option order", () => {
    const previews = abilityScorePreviews(
      feat({ abilityOptions: ["strength", "dexterity", "constitution"], abilityIncrease: 1 }),
      { strength: 8, dexterity: 12, constitution: 14 },
    );
    expect(previews.map((p) => p.key)).toEqual(["strength", "dexterity", "constitution"]);
  });
});
