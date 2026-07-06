// Pure 5e-rules sanity checks on the seed catalog data. NO database — this
// imports the side-effect-free consts from ../catalog-data.js, never seed.ts
// (which connects to Postgres at module load). These invariants guard the
// class of data bugs the app has only surfaced during play: absurd item
// weights (the "ball bearings" 1000-lb bag), a PHB class missing from the
// dropdown, and versatile weapons missing their second damage die.
import { describe, it, expect } from "vitest";

import { RACES, CLASSES, BACKGROUNDS, ITEMS, type CatalogItem } from "../catalog-data.js";

// The 12 PHB classes. If any is missing the character-creation dropdown is
// broken (Warlock/Druid have shipped missing before).
const PHB_CLASSES = [
  "Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk",
  "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard",
] as const;

// Weight ceiling, in pounds. The heaviest legitimate 5e item is plate armor
// at 65 lb; the next heaviest catalog rows are the equipment packs (~60 lb).
// 200 sits comfortably above every real item yet well below the kind of
// data-entry slip we want to catch — e.g. seeding a bag of 1000 ball bearings
// (really ~2 lb) at weight 1000, which once made a rogue's pack weigh 2000+ lb.
const MAX_ITEM_WEIGHT = 200;

// A weapon is "versatile" in this catalog iff it carries versatile dice. There
// is no separate boolean property — the dice fields ARE the marker.
const isVersatile = (i: CatalogItem) =>
  i.weapon?.versatileDiceCount !== undefined ||
  i.weapon?.versatileDiceFaces !== undefined;

// camelCase skill/ability key: starts lowercase, letters only, no spaces or
// Title Case. Guards the recurring "render a raw label as a key" footgun at
// the data layer.
const CAMEL_KEY = /^[a-z][a-zA-Z]*$/;

describe("CLASSES catalog", () => {
  it("contains every PHB class", () => {
    const names = CLASSES.map((c) => c.name);
    for (const phb of PHB_CLASSES) {
      expect(names, `PHB class "${phb}" missing from CLASSES`).toContain(phb);
    }
  });

  it("has no duplicate class names", () => {
    const names = CLASSES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses camelCase skill keys (no spaces / Title Case)", () => {
    for (const cls of CLASSES) {
      for (const skill of cls.skillChoices) {
        expect(skill, `class "${cls.name}" skill key "${skill}" is not camelCase`)
          .toMatch(CAMEL_KEY);
      }
    }
  });

  it("uses lowercase-word saving-throw keys", () => {
    for (const cls of CLASSES) {
      for (const save of cls.savingThrows) {
        expect(save, `class "${cls.name}" save "${save}" is not a lowercase key`)
          .toMatch(/^[a-z]+$/);
      }
    }
  });

  it("never lets a class choose more skills than it offers", () => {
    for (const cls of CLASSES) {
      expect(
        cls.skillChoiceCount,
        `class "${cls.name}" picks ${cls.skillChoiceCount} of ${cls.skillChoices.length} skills`,
      ).toBeLessThanOrEqual(cls.skillChoices.length);
    }
  });
});

describe("RACES catalog", () => {
  it("is non-empty and every race has a positive speed", () => {
    expect(RACES.length).toBeGreaterThan(0);
    for (const race of RACES) {
      expect(typeof race.speed, `race "${race.name}" speed not numeric`).toBe("number");
      expect(race.speed, `race "${race.name}" has non-positive speed`).toBeGreaterThan(0);
    }
  });

  it("has no duplicate race names", () => {
    // RACES mixes named subraces (Hill Dwarf) with legacy generic entries
    // (Dwarf) — distinct names, but a future edit could collide one.
    const names = RACES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("BACKGROUNDS catalog", () => {
  it("has no duplicate background names", () => {
    const names = BACKGROUNDS.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses camelCase skill-proficiency keys (no spaces / Title Case)", () => {
    // Background skill grants use the same camelCase keys (sleightOfHand,
    // animalHandling) that have caused the raw-key-rendered-as-label bug.
    for (const bg of BACKGROUNDS) {
      for (const skill of bg.skillProficiencies) {
        expect(skill, `background "${bg.name}" skill key "${skill}" is not camelCase`)
          .toMatch(CAMEL_KEY);
      }
    }
  });
});

describe("ITEMS catalog", () => {
  it("has no implausible weights", () => {
    for (const item of ITEMS) {
      const w = item.weight ?? 0; // weight is optional; absent means weightless
      expect(typeof w, `item "${item.name}" weight not numeric`).toBe("number");
      expect(Number.isFinite(w), `item "${item.name}" weight not finite`).toBe(true);
      expect(w, `item "${item.name}" has negative weight`).toBeGreaterThanOrEqual(0);
      expect(
        w,
        `item "${item.name}" weighs ${w} lb (>= ${MAX_ITEM_WEIGHT}) — likely a data-entry slip (cf. the ball-bearings bug)`,
      ).toBeLessThan(MAX_ITEM_WEIGHT);
    }
  });

  it("has unique item names", () => {
    const names = ITEMS.map((i) => i.name);
    const dupes = names.filter((n, idx) => names.indexOf(n) !== idx);
    expect(dupes, `duplicate catalog item names: ${[...new Set(dupes)].join(", ")}`).toEqual([]);
  });

  it("gives every versatile weapon both a base and a versatile damage die", () => {
    const versatile = ITEMS.filter(isVersatile);
    // Sanity: the catalog should actually contain versatile weapons, else the
    // filter is silently matching nothing and this test guards air.
    expect(versatile.length, "no versatile weapons found in ITEMS").toBeGreaterThan(0);

    for (const item of versatile) {
      const w = item.weapon!;
      expect(w.damageDiceCount, `${item.name}: missing base damageDiceCount`).toBeGreaterThan(0);
      expect(w.damageDiceFaces, `${item.name}: missing base damageDiceFaces`).toBeGreaterThan(0);
      expect(w.versatileDiceCount, `${item.name}: missing versatileDiceCount`).toBeGreaterThan(0);
      expect(w.versatileDiceFaces, `${item.name}: missing versatileDiceFaces`).toBeGreaterThan(0);
      // 5e: the two-handed (versatile) die is always at least as large as the
      // one-handed die — a smaller versatile die means the fields are swapped.
      expect(
        w.versatileDiceFaces!,
        `${item.name}: versatile die (d${w.versatileDiceFaces}) smaller than base die (d${w.damageDiceFaces})`,
      ).toBeGreaterThanOrEqual(w.damageDiceFaces);
    }
  });

  it("gives every weapon item a damage die and damage type", () => {
    for (const item of ITEMS.filter((i) => i.category === "weapon")) {
      expect(item.weapon, `weapon "${item.name}" has no weapon detail`).toBeDefined();
      const w = item.weapon!;
      expect(w.damageDiceCount, `weapon "${item.name}" damageDiceCount`).toBeGreaterThan(0);
      expect(w.damageDiceFaces, `weapon "${item.name}" damageDiceFaces`).toBeGreaterThan(0);
      expect(w.damageType, `weapon "${item.name}" damageType`).toBeTruthy();
    }
  });

  it("gives every armor item a positive base armor class", () => {
    for (const item of ITEMS.filter((i) => i.category === "armor")) {
      expect(item.armor, `armor "${item.name}" has no armor detail`).toBeDefined();
      expect(item.armor!.baseArmorClass, `armor "${item.name}" baseArmorClass`).toBeGreaterThan(0);
    }
  });
});
