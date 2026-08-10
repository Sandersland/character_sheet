import { describe, it, expect } from "vitest";

import { fightingStyleFeatOfferedForClasses } from "@/lib/srd/srd.js";

/**
 * PHB'14 p. 72 (Fighter) / p. 82 (Paladin) / p. 91 (Ranger), = SRD 5.1 (#1495).
 * Fighter gets all six styles; Paladin and Ranger each get a four-style
 * subset. SRD 5.2/PHB'24 draws no per-class subset — any class with the
 * Fighting Style feature may take any of the four 2024 styles.
 */
describe("fightingStyleFeatOfferedForClasses", () => {
  const archery = { classes: ["Fighter", "Ranger"] };
  const defense = { classes: ["Fighter", "Paladin", "Ranger"] };
  const dueling = { classes: ["Fighter", "Paladin", "Ranger"] };
  const greatWeaponFighting = { classes: ["Fighter", "Paladin"] };
  const protection = { classes: ["Fighter", "Paladin"] };
  const twoWeaponFighting = { classes: ["Fighter", "Ranger"] };
  const unrestricted = { classes: [] };

  describe("EDITION_2014", () => {
    it("offers a 2014 Ranger exactly Archery, Defense, Dueling, Two-Weapon Fighting", () => {
      const offered = (feat: { classes: string[] }) =>
        fightingStyleFeatOfferedForClasses(feat, ["Ranger"], "EDITION_2014");
      expect(offered(archery)).toBe(true);
      expect(offered(defense)).toBe(true);
      expect(offered(dueling)).toBe(true);
      expect(offered(twoWeaponFighting)).toBe(true);
      expect(offered(greatWeaponFighting)).toBe(false);
      expect(offered(protection)).toBe(false);
    });

    it("offers a 2014 Paladin exactly Defense, Dueling, Great Weapon Fighting, Protection", () => {
      const offered = (feat: { classes: string[] }) =>
        fightingStyleFeatOfferedForClasses(feat, ["Paladin"], "EDITION_2014");
      expect(offered(defense)).toBe(true);
      expect(offered(dueling)).toBe(true);
      expect(offered(greatWeaponFighting)).toBe(true);
      expect(offered(protection)).toBe(true);
      expect(offered(archery)).toBe(false);
      expect(offered(twoWeaponFighting)).toBe(false);
    });

    it("offers a 2014 Fighter all six styles", () => {
      const offered = (feat: { classes: string[] }) =>
        fightingStyleFeatOfferedForClasses(feat, ["Fighter"], "EDITION_2014");
      for (const feat of [archery, defense, dueling, greatWeaponFighting, protection, twoWeaponFighting]) {
        expect(offered(feat)).toBe(true);
      }
    });

    it("matches class names case-insensitively", () => {
      expect(fightingStyleFeatOfferedForClasses(archery, ["ranger"], "EDITION_2014")).toBe(true);
      expect(fightingStyleFeatOfferedForClasses(archery, ["RANGER"], "EDITION_2014")).toBe(true);
      expect(fightingStyleFeatOfferedForClasses(archery, [" Ranger "], "EDITION_2014")).toBe(true);
    });

    it("an empty classes list (unrestricted row) is offered to any class", () => {
      expect(fightingStyleFeatOfferedForClasses(unrestricted, ["Wizard"], "EDITION_2014")).toBe(true);
    });

    it("a multiclass Fighter1/Paladin2 sees the union (Fighter alone already covers all six)", () => {
      const offered = (feat: { classes: string[] }) =>
        fightingStyleFeatOfferedForClasses(feat, ["Fighter", "Paladin"], "EDITION_2014");
      for (const feat of [archery, defense, dueling, greatWeaponFighting, protection, twoWeaponFighting]) {
        expect(offered(feat)).toBe(true);
      }
    });

    it("a multiclass Paladin1/Ranger2 union adds what neither class alone offers", () => {
      const offered = (feat: { classes: string[] }) =>
        fightingStyleFeatOfferedForClasses(feat, ["Paladin", "Ranger"], "EDITION_2014");
      // Archery: Ranger-only. Protection: Paladin-only. Both must be offered
      // in the union even though neither single class offers both.
      expect(offered(archery)).toBe(true);
      expect(offered(protection)).toBe(true);
      // Great Weapon Fighting (Fighter/Paladin) and Two-Weapon Fighting
      // (Fighter/Ranger) are each covered by one of the two classes too.
      expect(offered(greatWeaponFighting)).toBe(true);
      expect(offered(twoWeaponFighting)).toBe(true);
    });

    it("a class with no matching entry is offered nothing from a restricted row", () => {
      expect(fightingStyleFeatOfferedForClasses(archery, ["Wizard"], "EDITION_2014")).toBe(false);
    });
  });

  describe("EDITION_2024", () => {
    it("draws no per-class subset — every class is offered every style", () => {
      for (const feat of [archery, defense, greatWeaponFighting, twoWeaponFighting]) {
        expect(fightingStyleFeatOfferedForClasses(feat, ["Ranger"], "EDITION_2024")).toBe(true);
        expect(fightingStyleFeatOfferedForClasses(feat, ["Paladin"], "EDITION_2024")).toBe(true);
        expect(fightingStyleFeatOfferedForClasses(feat, ["Fighter"], "EDITION_2024")).toBe(true);
      }
    });
  });
});
