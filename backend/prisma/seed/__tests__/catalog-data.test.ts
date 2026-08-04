// Pure 5e-rules sanity checks on the seed catalog data. NO database — this
// imports the side-effect-free consts from ../catalog-data.js, never seed.ts
// (which connects to Postgres at module load). These invariants guard the
// class of data bugs the app has only surfaced during play: absurd item
// weights (the "ball bearings" 1000-lb bag), a PHB class missing from the
// dropdown, and versatile weapons missing their second damage die.
import { describe, it, expect } from "vitest";

import { toolsByCategory, type ToolCategory } from "@/lib/srd/tools.js";

import { CLASSES, BACKGROUNDS, ITEMS, type CatalogItem } from "../catalog-data.js";

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

  // #1570: PHB'24 has sixteen backgrounds and Folk Hero is not among them, so a
  // shared (NULL) row would keep offering it to 2024 characters as the one
  // background that cannot give them the ability spread and Origin feat PHB'24
  // guarantees — a silent forfeit of +3 points and a feat, with nothing in the
  // UI to explain it. Its 2014-ness is the reason it has no abilityChoices, so
  // the tag and the empty spread must move together.
  it("tags Folk Hero EDITION_2014 rather than leaving it shared", () => {
    const folkHero = BACKGROUNDS.find((b) => b.name === "Folk Hero");
    expect(folkHero?.edition).toBe("EDITION_2014");
    expect(folkHero?.abilityChoices ?? []).toEqual([]);
    expect(folkHero?.originFeatName).toBeUndefined();
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

// #1564: the twelve items every PHB'24 class package needs that #1534's ITEMS
// catalog didn't carry yet — parsed from raw HTML (5e24srd.com, CC-BY-4.0,
// SRD 5.2) and cross-checked against SRD 5.1 (5thsrd.org); every value is
// identical in both editions (that identity is WHY one untagged Item row can
// serve both — see this issue's research comment). "Musical Instrument" is a
// category, not one item: nine of its ten concrete instruments are new here
// (Lute already existed); each entry below pins name/category/weight/cost so
// a future edit can't silently drift from the cited SRD 5.2 tables.
describe("ITEMS catalog — PHB'24 additions (#1564, SRD 5.2)", () => {
  const byName = (name: string) => ITEMS.find((i) => i.name === name);

  it("adds Greatsword: 2d6 slashing, heavy, two-handed, martial melee, 6 lb, 50 gp", () => {
    const item = byName("Greatsword");
    expect(item).toBeDefined();
    expect(item!.category).toBe("weapon");
    expect(item!.weight).toBe(6);
    expect(item!.cost).toEqual({ cp: 0, sp: 0, gp: 50, pp: 0 });
    expect(item!.weapon).toEqual({
      damageDiceCount: 2,
      damageDiceFaces: 6,
      damageType: "slashing",
      heavy: true,
      twoHanded: true,
      weaponClass: "martial",
      weaponRange: "melee",
    });
  });

  it("adds Flail: 1d8 bludgeoning, martial melee, no special properties, 2 lb, 10 gp", () => {
    const item = byName("Flail");
    expect(item).toBeDefined();
    expect(item!.weight).toBe(2);
    expect(item!.cost).toEqual({ cp: 0, sp: 0, gp: 10, pp: 0 });
    expect(item!.weapon).toEqual({
      damageDiceCount: 1,
      damageDiceFaces: 8,
      damageType: "bludgeoning",
      weaponClass: "martial",
      weaponRange: "melee",
    });
  });

  it("adds Spear: 1d6 piercing, thrown 20/60, versatile 1d8, simple melee, 3 lb, 1 gp", () => {
    const item = byName("Spear");
    expect(item).toBeDefined();
    expect(item!.weight).toBe(3);
    expect(item!.cost).toEqual({ cp: 0, sp: 0, gp: 1, pp: 0 });
    expect(item!.weapon).toEqual({
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageType: "piercing",
      thrown: true,
      rangeNormal: 20,
      rangeLong: 60,
      versatileDiceCount: 1,
      versatileDiceFaces: 8,
      weaponClass: "simple",
      weaponRange: "melee",
    });
  });

  it("adds Sickle: 1d4 slashing, light, simple melee, 2 lb, 1 gp", () => {
    const item = byName("Sickle");
    expect(item).toBeDefined();
    expect(item!.weight).toBe(2);
    expect(item!.cost).toEqual({ cp: 0, sp: 0, gp: 1, pp: 0 });
    expect(item!.weapon).toEqual({
      damageDiceCount: 1,
      damageDiceFaces: 4,
      damageType: "slashing",
      light: true,
      weaponClass: "simple",
      weaponRange: "melee",
    });
  });

  it("adds Studded Leather Armor: light, AC 12 + Dex, 13 lb, 45 gp", () => {
    const item = byName("Studded Leather Armor");
    expect(item).toBeDefined();
    expect(item!.weight).toBe(13);
    expect(item!.cost).toEqual({ cp: 0, sp: 0, gp: 45, pp: 0 });
    expect(item!.armor).toEqual({
      armorCategory: "light",
      baseArmorClass: 12,
      dexModifierApplies: true,
    });
  });

  it("adds Chain Shirt: medium, AC 13 + Dex (max 2), 20 lb, 50 gp", () => {
    const item = byName("Chain Shirt");
    expect(item).toBeDefined();
    expect(item!.weight).toBe(20);
    expect(item!.cost).toEqual({ cp: 0, sp: 0, gp: 50, pp: 0 });
    expect(item!.armor).toEqual({
      armorCategory: "medium",
      baseArmorClass: 13,
      dexModifierApplies: true,
      dexModifierMax: 2,
    });
  });

  it("adds Quiver, Robe, Crystal, Orb, Herbalism Kit as gear with the SRD 5.2 weight/cost", () => {
    const expectations: [string, number, number][] = [
      ["Quiver", 1, 1],
      ["Robe", 4, 1],
      ["Crystal", 1, 10],
      ["Orb", 3, 20],
      ["Herbalism Kit", 3, 5],
    ];
    for (const [name, weight, gp] of expectations) {
      const item = byName(name);
      expect(item, `"${name}" missing from ITEMS`).toBeDefined();
      expect(item!.category, `"${name}" category`).toBe("gear");
      expect(item!.weight, `"${name}" weight`).toBe(weight);
      expect(item!.cost, `"${name}" cost`).toEqual({ cp: 0, sp: 0, gp, pp: 0 });
    }
  });

  it("adds the nine missing musical instruments as gear (Lute already existed)", () => {
    const expectations: [string, number, number][] = [
      ["Bagpipes", 6, 30],
      ["Drum", 3, 6],
      ["Dulcimer", 10, 25],
      ["Flute", 1, 2],
      ["Horn", 2, 3],
      ["Lyre", 2, 30],
      ["Pan Flute", 2, 12],
      ["Shawm", 1, 2],
      ["Viol", 1, 30],
    ];
    for (const [name, weight, gp] of expectations) {
      const item = byName(name);
      expect(item, `"${name}" missing from ITEMS`).toBeDefined();
      expect(item!.category, `"${name}" category`).toBe("gear");
      expect(item!.weight, `"${name}" weight`).toBe(weight);
      expect(item!.cost, `"${name}" cost`).toEqual({ cp: 0, sp: 0, gp, pp: 0 });
    }
  });

  // Lute is untouched by this issue — pinned so a future edit can't drift it
  // while adding its nine siblings.
  it("leaves the existing Lute (35 gp, 2 lb) unchanged", () => {
    const item = byName("Lute");
    expect(item!.weight).toBe(2);
    expect(item!.cost).toEqual({ cp: 0, sp: 0, gp: 35, pp: 0 });
  });

  // No weapon-mastery properties (Graze/Sap/Nick/Vex/Topple, SRD 5.2) exist
  // anywhere in WeaponDetailInput — this just documents that Greatsword/
  // Flail/Spear/Sickle above carry nothing beyond the shared 5.1/5.2 stat
  // line, rather than a reader wondering if mastery was forgotten.
  it("does not model SRD 5.2 weapon-mastery properties on the new weapons", () => {
    for (const name of ["Greatsword", "Flail", "Spear", "Sickle"]) {
      const keys = Object.keys(byName(name)!.weapon ?? {});
      for (const masteryKey of ["mastery", "graze", "sap", "nick", "vex", "topple"]) {
        expect(keys.map((k) => k.toLowerCase())).not.toContain(masteryKey);
      }
    }
  });

  // #1564 commit 4: only the small set of Item rows that ARE tools carry
  // toolCategory — the open-pick validator reads this column so a Bard's
  // "musical instrument of your choice" or a Monk's tool-bound pick never
  // reaches into lib/srd/tools.ts. Everything else stays untagged (null).
  it("tags the ten musical instruments with toolCategory: musicalInstrument", () => {
    for (const name of ["Bagpipes", "Drum", "Dulcimer", "Flute", "Horn", "Lute", "Lyre", "Pan Flute", "Shawm", "Viol"]) {
      expect(byName(name)!.toolCategory, `"${name}" toolCategory`).toBe("musicalInstrument");
    }
  });

  it("tags Herbalism Kit and Thieves' Tools with toolCategory: other", () => {
    for (const name of ["Herbalism Kit", "Thieves' Tools"]) {
      expect(byName(name)!.toolCategory, `"${name}" toolCategory`).toBe("other");
    }
  });

  it("leaves non-tool items untagged (toolCategory undefined)", () => {
    for (const name of ["Greatsword", "Spellbook", "Backpack"]) {
      expect(byName(name)!.toolCategory, `"${name}" toolCategory`).toBeUndefined();
    }
  });
});

// #1570: an UNBOUND open pick ("artisan's tools of your choice") is offered from
// the Item rows carrying that toolCategory — TOOLS plays no part in the dropdown,
// it only validates proficiency choices. The two drifted: TOOLS listed all
// seventeen artisan tools while ITEMS carried one (Calligrapher's Supplies), so
// Folk Hero's signature choice would have rendered as a one-entry dropdown that
// looks like a bug and can't express the background. Same species as the nine
// instruments (#1564) and four gaming sets (#1565), each added when a pick first
// needed a pool. Scoped to the three categories a filter can name; "other" tools
// are only ever referenced by exact catalogName (Thieves' Tools, Forgery Kit),
// never pooled, so their Item rows stay demand-driven.
// TOOLS omits the zero coin denominations ITEMS spells out (and ITEMS carries a
// pp field TOOLS has no concept of), so both sides are normalized to the three
// denominations a tool's price can actually use before being compared.
function coinTriple(cost?: { gp?: number; sp?: number; cp?: number }) {
  return { gp: cost?.gp ?? 0, sp: cost?.sp ?? 0, cp: cost?.cp ?? 0 };
}

describe("tool Items back every pickable tool category (#1570)", () => {
  const PICKABLE: ToolCategory[] = ["artisan", "gamingSet", "musicalInstrument"];

  it.each(PICKABLE)("every %s tool in TOOLS has a matching Item row", (category) => {
    const missing = toolsByCategory(category)
      .filter((tool) => !ITEMS.some((i) => i.name === tool.name))
      .map((t) => t.name);
    expect(missing, `${category} tools with no Item row — an open pick would not offer them`).toEqual([]);
  });

  it.each(PICKABLE)("every %s Item agrees with TOOLS on cost and weight", (category) => {
    for (const tool of toolsByCategory(category)) {
      const item = ITEMS.find((i) => i.name === tool.name);
      if (!item) continue; // absence is the previous test's assertion, not this one's
      expect(item.toolCategory, `"${tool.name}" toolCategory`).toBe(category);
      expect(item.weight ?? 0, `"${tool.name}" weight`).toBe(tool.weight ?? 0);
      expect(coinTriple(item.cost), `"${tool.name}" cost`).toEqual(coinTriple(tool.cost));
    }
  });
});
