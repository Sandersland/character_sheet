import { describe, it, expect } from "vitest";

import {
  casterFractionFor,
  deriveSpellcasting,
  spellcastingStartLevel,
} from "@/lib/srd/srd.js";
import { ELDRITCH_KNIGHT, ARCANE_TRICKSTER, NON_CASTER_SUBCLASS } from "./third-caster.fixture.js";

// Resolution reads the Subclass row's own casterFraction/spellcastingAbility columns; production code never matches a name string (#1531).
const CASTER_SCORES = { intelligence: 16, wisdom: 10, charisma: 10, strength: 10, dexterity: 10, constitution: 10 };

describe("third-caster identity resolves off the Subclass row, never a name match (#1531)", () => {
  it("Eldritch Knight resolves as an Intelligence third caster via subclassRef", () => {
    expect(casterFractionFor("Fighter", ELDRITCH_KNIGHT)).toBe("third");
    expect(spellcastingStartLevel("Fighter", ELDRITCH_KNIGHT, "EDITION_2024")).toBe(3);
    const derived = deriveSpellcasting("Fighter", 3, CASTER_SCORES, 2, ELDRITCH_KNIGHT, "EDITION_2024");
    expect(derived?.ability).toBe("intelligence");
    expect(derived?.slotTotals).toEqual([{ level: 1, total: 2 }]);
  });

  it("Arcane Trickster resolves as an Intelligence third caster via subclassRef", () => {
    expect(casterFractionFor("Rogue", ARCANE_TRICKSTER)).toBe("third");
    expect(spellcastingStartLevel("Rogue", ARCANE_TRICKSTER, "EDITION_2024")).toBe(3);
    const derived = deriveSpellcasting("Rogue", 3, CASTER_SCORES, 2, ARCANE_TRICKSTER, "EDITION_2024");
    expect(derived?.ability).toBe("intelligence");
    expect(derived?.slotTotals).toEqual([{ level: 1, total: 2 }]);
  });

  it("a drifted display name never matters — resolution reads ONLY subclassRef", () => {
    // The display name column can diverge from the catalog row's name; subclassRef is the only third-caster input, and a caller doesn't even pass the display name in.
    const derived = deriveSpellcasting("Fighter", 4, CASTER_SCORES, 2, ELDRITCH_KNIGHT, "EDITION_2024");
    expect(derived?.ability).toBe("intelligence");
    expect(derived?.slotTotals).toEqual([{ level: 1, total: 3 }]);
  });

  it("a homebrew subclass named to CONTAIN \"eldritch knight\" is not a caster — #1339's lesson, unrepresentable by construction", () => {
    // A homebrew subclass has no real Subclass row wired to these columns, so a #1339-style substring-match collision can't occur, by construction.
    expect(casterFractionFor("Fighter", null)).toBe("none");
    expect(deriveSpellcasting("Fighter", 5, CASTER_SCORES, 2, null, "EDITION_2024")).toBeNull();
    expect(deriveSpellcasting("Fighter", 5, CASTER_SCORES, 2, undefined, "EDITION_2024")).toBeNull();
  });

  it("a real non-caster subclass (Champion) reports no caster fraction and no spell slots", () => {
    expect(casterFractionFor("Fighter", NON_CASTER_SUBCLASS)).toBe("none");
    expect(deriveSpellcasting("Fighter", 20, CASTER_SCORES, 2, NON_CASTER_SUBCLASS, "EDITION_2024")).toBeNull();
  });
});
