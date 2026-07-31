// #1529: buildMergedArmorProficiencies/buildMergedWeaponProficiencies resolve
// class grants through the class FK relation now, never `entry.name` — the
// fix for #1388's class half (a lowercase and a display-name class-entry name
// used to disagree on whether the SAME class's grants applied; with the
// name-keyed lookup deleted, that failure mode is unrepresentable).
import { describe, expect, it } from "vitest";

import { buildMergedArmorProficiencies, buildMergedWeaponProficiencies } from "@/lib/character/serialize/proficiencies.js";

const FIGHTER_GRANTS = { armorProficiencies: ["light", "medium", "heavy", "shield"], weaponProficiencies: ["Simple Weapons", "Martial Weapons"] };

describe("buildMergedArmorProficiencies / buildMergedWeaponProficiencies — resolution is by classId, not name (#1388)", () => {
  it("a lowercase-name entry and a display-name entry with the SAME classId resolve identically", () => {
    const lowercase = [{ class: FIGHTER_GRANTS }]; // entry.name would have been "fighter"
    const displayName = [{ class: FIGHTER_GRANTS }]; // entry.name would have been "Fighter"

    const armorLower = buildMergedArmorProficiencies(lowercase, undefined, new Set());
    const armorDisplay = buildMergedArmorProficiencies(displayName, undefined, new Set());
    expect(armorLower).toEqual(armorDisplay);
    expect(armorLower.map((g) => g.category)).toEqual(["light", "medium", "heavy", "shield"]);

    const weaponLower = buildMergedWeaponProficiencies(lowercase, undefined, new Set());
    const weaponDisplay = buildMergedWeaponProficiencies(displayName, undefined, new Set());
    expect(weaponLower).toEqual(weaponDisplay);
    expect(weaponLower.map((g) => g.name)).toEqual(["Simple Weapons", "Martial Weapons"]);
  });

  // Mutation proof: the #1388 bug (a lowercase entry name losing armor/weapon
  // proficiencies its display-name twin received) can no longer be WRITTEN as
  // a test, because neither function reads `entry.name` at all any more —
  // there is no code path left to feed a differing name into.
  it("a homebrew entry (no class relation) grants nothing, even when its name matches a real class", () => {
    const homebrew = [{ name: "Fighter", class: null }] as unknown as { class: { armorProficiencies: string[] } | null }[];
    expect(buildMergedArmorProficiencies(homebrew, undefined, new Set())).toEqual([]);
    expect(
      buildMergedWeaponProficiencies(homebrew as unknown as { class: { weaponProficiencies: string[] } | null }[], undefined, new Set()),
    ).toEqual([]);
  });

  it("feat/race grants still layer on top of an absent class relation", () => {
    const homebrew = [{ class: null }];
    const armor = buildMergedArmorProficiencies(homebrew, undefined, new Set(["light"]));
    expect(armor).toEqual([{ category: "light", source: "feat" }]);
  });
});
