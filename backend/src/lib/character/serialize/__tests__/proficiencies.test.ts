// buildMergedArmorProficiencies/buildMergedWeaponProficiencies resolve class grants through the class FK relation, never entry.name (#1529) — a lowercase vs display-name entry can no longer disagree (#1388).
import { describe, expect, it } from "vitest";

import { buildMergedArmorProficiencies, buildMergedWeaponProficiencies } from "@/lib/character/serialize/proficiencies.js";

const FIGHTER_GRANTS = { armorProficiencies: ["light", "medium", "heavy", "shield"], weaponProficiencies: ["Simple Weapons", "Martial Weapons"] };

describe("buildMergedArmorProficiencies / buildMergedWeaponProficiencies — resolution is by classId, not name (#1388)", () => {
  it("a lowercase-name entry and a display-name entry with the SAME classId resolve identically", () => {
    const lowercase = [{ name: "fighter", class: FIGHTER_GRANTS }];
    const displayName = [{ name: "Fighter", class: FIGHTER_GRANTS }];

    const armorLower = buildMergedArmorProficiencies(lowercase, new Set());
    const armorDisplay = buildMergedArmorProficiencies(displayName, new Set());
    expect(armorLower).toEqual(armorDisplay);
    expect(armorLower.map((g) => g.category)).toEqual(["light", "medium", "heavy", "shield"]);

    const weaponLower = buildMergedWeaponProficiencies(lowercase, new Set());
    const weaponDisplay = buildMergedWeaponProficiencies(displayName, new Set());
    expect(weaponLower).toEqual(weaponDisplay);
    expect(weaponLower.map((g) => g.name)).toEqual(["Simple Weapons", "Martial Weapons"]);
  });

  // Mutation proof: the #1388 bug can no longer be WRITTEN as a test — neither function reads entry.name any more, so there's no code path left to feed a differing name into.
  it("a homebrew entry (no class relation) grants nothing, even when its name matches a real class", () => {
    const homebrew = [{ name: "Fighter", class: null }] as unknown as { class: { armorProficiencies: string[] } | null }[];
    expect(buildMergedArmorProficiencies(homebrew, new Set())).toEqual([]);
    expect(
      buildMergedWeaponProficiencies(homebrew as unknown as { class: { weaponProficiencies: string[] } | null }[], new Set()),
    ).toEqual([]);
  });

  it("feat grants (which include #1682 species-trait grants, e.g. Mountain Dwarf armor) still layer on top of an absent class relation", () => {
    const homebrew = [{ class: null }];
    const armor = buildMergedArmorProficiencies(homebrew, new Set(["light"]));
    expect(armor).toEqual([{ category: "light", source: "feat" }]);
  });
});
