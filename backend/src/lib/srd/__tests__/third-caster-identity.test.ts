import { describe, it, expect } from "vitest";

import {
  casterFractionFor,
  deriveSpellcasting,
  spellcastingStartLevel,
} from "@/lib/srd/srd.js";
import { ELDRITCH_KNIGHT, ARCANE_TRICKSTER, NON_CASTER_SUBCLASS } from "./third-caster.fixture.js";

// #1531: third-caster identity moves onto the Subclass row's own
// casterFraction/spellcastingAbility columns, retiring THIRD_CASTER_SUBCLASSES
// (the lowercase-subclass-NAME-keyed lookup this module used to gate every
// third-caster check on — the last name-keyed subclass lookup in lib/srd/,
// and #1339's failure shape). ELDRITCH_KNIGHT/ARCANE_TRICKSTER/
// NON_CASTER_SUBCLASS (third-caster.fixture.ts) are what a real Prisma
// `subclassRef` read resolves to — production code never matches on a name
// string to reach this classification.

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
    // The character-entry `subclass` display name column is free to diverge
    // from the catalog row's name (schema.prisma's own comment on that
    // column) — e.g. a renamed entry still pointing at the Eldritch Knight
    // catalog row via its FK. deriveSpellcasting's `subclassRef` parameter is
    // the ONLY third-caster input; a caller doesn't even pass the drifted
    // name in anymore, proving the name plays no role at all.
    const derived = deriveSpellcasting("Fighter", 4, CASTER_SCORES, 2, ELDRITCH_KNIGHT, "EDITION_2024");
    expect(derived?.ability).toBe("intelligence");
    expect(derived?.slotTotals).toEqual([{ level: 1, total: 3 }]);
  });

  it("a homebrew subclass named to CONTAIN \"eldritch knight\" is not a caster — #1339's lesson, unrepresentable by construction", () => {
    // A homebrew subclass has no real Subclass row wired to third-caster
    // columns (or one with casterFraction left NULL) — the display name
    // ("Eldritch Knight's Cousin", say) is irrelevant; there is no name input
    // to this resolution at all, so a name-collision failure like #1339's
    // (a "Way of Shadow" 2014 monk silently inheriting 2024 Warrior of
    // Shadow mechanics via a substring match) cannot occur here by
    // construction — not even representable, let alone tested around.
    expect(casterFractionFor("Fighter", null)).toBe("none");
    expect(deriveSpellcasting("Fighter", 5, CASTER_SCORES, 2, null, "EDITION_2024")).toBeNull();
    expect(deriveSpellcasting("Fighter", 5, CASTER_SCORES, 2, undefined, "EDITION_2024")).toBeNull();
  });

  it("a real non-caster subclass (Champion) reports no caster fraction and no spell slots", () => {
    expect(casterFractionFor("Fighter", NON_CASTER_SUBCLASS)).toBe("none");
    expect(deriveSpellcasting("Fighter", 20, CASTER_SCORES, 2, NON_CASTER_SUBCLASS, "EDITION_2024")).toBeNull();
  });
});
