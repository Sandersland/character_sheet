// #1589: deriveAnnouncedSaveDC generalised to base-class rows, not only
// subclass rows gated on `sub.active` — Cleric's Turn Undead/Channel Divinity
// (subclassId: null) are the proving case (see cleric-features.ts's own
// header). ClassExtras.maneuverSaveDC is renamed to the non-Fighter-specific
// `announcedSaveDC` in the same change. These tests exercise the SHARED rule
// function (deriveResources/deriveEntryScopedResources) directly with a
// synthetic base-class row — no DB, no real class name — mirroring
// entry-scoped-resources.test.ts's own style.
import { describe, expect, it } from "vitest";

import { deriveEntryScopedResources, deriveResources } from "@/lib/classes/class-features.js";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { testFeatureRowsFor } from "./test-feature-rows.fixture.js";

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 16, // +3
  charisma: 10,
};

// A synthetic base-class row (subclassId: null in the real schema — modelled
// here as a plain classRows entry, never subclassRows) declaring
// saveDcAbilities — the Turn Undead/Channel Divinity shape #1589 unblocks.
function baseRowWithSaveDc(edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024"): ClassFeatureRow {
  return {
    name: "Test Announce",
    level: 1,
    description: "Test-only base-class row with an announced save DC.",
    edition,
    saveDcAbilities: ["wisdom"],
  };
}

describe("deriveAnnouncedSaveDC generalised to base-class rows (#1589)", () => {
  it("populates announcedSaveDC from a BASE-CLASS row's saveDcAbilities, with no subclass at all", () => {
    const level = 5;
    const profBonus = proficiencyBonusForLevel(level);
    const result = deriveResources(
      "testbaseclass",
      undefined,
      level,
      ABILITY_SCORES,
      profBonus,
      { classRows: [baseRowWithSaveDc()], subclassRows: [] },
      "EDITION_2024",
    );
    // 8 + prof(3) + WIS mod(+3) = 14
    expect(result?.announcedSaveDC).toBe(8 + profBonus + 3);
  });

  it("still returns undefined when no row (base or subclass) declares saveDcAbilities", () => {
    const level = 5;
    const profBonus = proficiencyBonusForLevel(level);
    const result = deriveResources(
      "monk",
      undefined,
      level,
      ABILITY_SCORES,
      profBonus,
      testFeatureRowsFor("monk", undefined),
      "EDITION_2024",
    );
    expect(result?.announcedSaveDC).toBeUndefined();
  });

  it("cross-entry collision: two DIFFERENT class entries each declaring an announced save DC throws, instead of one silently clobbering the other", () => {
    const totalLevel = 8; // testbaseclass 5 + fighter(battle master) 3
    const profBonus = proficiencyBonusForLevel(totalLevel);
    const entries = [
      { name: "testbaseclass", subclass: undefined, level: 5 },
      { name: "fighter", subclass: "battle master", level: 3 },
    ];
    const getFeatureRows = (e: { name: string; subclass?: string }) =>
      e.name === "testbaseclass"
        ? { classRows: [baseRowWithSaveDc()], subclassRows: [] }
        : testFeatureRowsFor(e.name, e.subclass);

    expect(() =>
      deriveEntryScopedResources(entries, totalLevel, ABILITY_SCORES, profBonus, "EDITION_2024", getFeatureRows),
    ).toThrow(/announced save DC/i);
  });

  it("single Battle Master entry (the pre-#1589 sole producer) is unaffected — no collision, no throw", () => {
    const level = 3;
    const profBonus = proficiencyBonusForLevel(level);
    const entries = [{ name: "fighter", subclass: "battle master", level }];
    const { derived } = deriveEntryScopedResources(entries, level, ABILITY_SCORES, profBonus, "EDITION_2024", (e) =>
      testFeatureRowsFor(e.name, e.subclass),
    );
    expect(derived?.announcedSaveDC).toBeDefined();
  });

  // combineRowExtras' own comment: within ONE class entry, a base-class row
  // and its active subclass's row can't both win — subclass wins on a
  // same-key collision (spreads subclassRows last). No shipped row set hits
  // this today (Cleric leaves saveDcAbilities unset — cleric-features.ts's
  // own header), but the precedence is a real, documented design decision
  // that deserves a runnable proof, not just a comment.
  it("within a single class entry, an active subclass row's announcedSaveDC wins over a base-class row's (subclass overrides base)", () => {
    // "fighter"/"battle master" — a REAL registered subclass (unlike
    // "testbaseclass" above) so `sub.active` actually resolves true at
    // level 5 (gate 3 in EDITION_2024); an unregistered subclass name would
    // make isSubclassActive short-circuit false and never read subclassRows.
    const level = 5;
    const profBonus = proficiencyBonusForLevel(level);
    const result = deriveResources(
      "fighter",
      "battle master",
      level,
      ABILITY_SCORES,
      profBonus,
      {
        classRows: [baseRowWithSaveDc()], // WIS +3 -> DC 8 + prof + 3
        subclassRows: [{ ...baseRowWithSaveDc(), saveDcAbilities: ["strength", "dexterity"] }], // STR/DEX +0 -> DC 8 + prof + 0
      },
      "EDITION_2024",
    );
    expect(result?.announcedSaveDC).toBe(8 + profBonus + 0);
  });
});
