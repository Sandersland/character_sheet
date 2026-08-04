// Pure 5e-rules sanity checks on SPECIES — no database, same role as
// catalog-data.test.ts (CLASSES/BACKGROUNDS). Guards the roster-parity
// invariants the epic names explicitly: neither edition's roster contains the
// other's exclusives, and the PHB'14 Dwarf 25 ft / PHB'24 Dwarf 30 ft canary.
import { describe, it, expect } from "vitest";

import { SPECIES, speciesSeedSchema } from "../species-data.js";

const speciesFor = (edition: "EDITION_2014" | "EDITION_2024") => SPECIES.filter((s) => s.edition === edition);

const PHB14_ROSTER = [
  "Dwarf", "Elf", "Halfling", "Human", "Dragonborn", "Gnome", "Half-Elf", "Half-Orc", "Tiefling",
] as const;

const PHB24_ROSTER = [
  "Aasimar", "Dragonborn", "Dwarf", "Elf", "Gnome", "Goliath", "Halfling", "Human", "Orc", "Tiefling",
] as const;

describe("SPECIES catalog — every row validates", () => {
  it("every row (including nested variants) satisfies speciesSeedSchema", () => {
    for (const [index, species] of SPECIES.entries()) {
      const result = speciesSeedSchema.safeParse(species);
      expect(result.success, `SPECIES[${index}] (${species.name}, ${species.edition}): ${result.success ? "" : result.error.message}`).toBe(true);
    }
  });
});

describe("2014 roster (PHB'14, full subrace list, Variant Human excluded)", () => {
  const roster2014 = speciesFor("EDITION_2014");

  it("contains exactly the 9 PHB'14 races, no more, no fewer", () => {
    expect(roster2014.map((s) => s.name).sort()).toEqual([...PHB14_ROSTER].sort());
  });

  it("excludes every 2024-exclusive species (Aasimar/Goliath/Orc)", () => {
    const names = roster2014.map((s) => s.name);
    expect(names).not.toContain("Aasimar");
    expect(names).not.toContain("Goliath");
    expect(names).not.toContain("Orc");
  });

  it("canary: Dwarf is 25 ft in PHB'14", () => {
    const dwarf = roster2014.find((s) => s.name === "Dwarf");
    expect(dwarf?.speed).toBe(25);
  });

  it("carries the full PHB'14 subrace list for Dwarf/Elf/Halfling/Gnome", () => {
    const variantNames = (name: string) => roster2014.find((s) => s.name === name)?.variants?.map((v) => v.name).sort();
    expect(variantNames("Dwarf")).toEqual(["Hill Dwarf", "Mountain Dwarf"]);
    expect(variantNames("Elf")).toEqual(["Drow", "High Elf", "Wood Elf"]);
    expect(variantNames("Halfling")).toEqual(["Lightfoot Halfling", "Stout Halfling"]);
    expect(variantNames("Gnome")).toEqual(["Forest Gnome", "Rock Gnome"]);
  });

  it("excludes Variant Human (epic review decision 9 — wave 2)", () => {
    const human = roster2014.find((s) => s.name === "Human");
    expect(human?.variants ?? []).toHaveLength(0);
  });

  it("Human carries no species-level variants but a full six +1 ability spread", () => {
    const human = roster2014.find((s) => s.name === "Human");
    expect(human?.abilityIncreases).toHaveLength(6);
    expect(human?.abilityIncreases?.every((inc) => "ability" in inc && inc.amount === 1)).toBe(true);
  });

  it("Half-Elf carries a fixed +2 CHA plus a choose-two-of-five +1 entry", () => {
    const halfElf = roster2014.find((s) => s.name === "Half-Elf");
    expect(halfElf?.abilityIncreases).toEqual([
      { ability: "charisma", amount: 2 },
      {
        choose: {
          count: 2,
          amount: 1,
          from: ["strength", "dexterity", "constitution", "intelligence", "wisdom"],
        },
      },
    ]);
  });

  it("Dragonborn carries the 10 draconic ancestry variants, no ability increase on any variant", () => {
    const dragonborn = roster2014.find((s) => s.name === "Dragonborn");
    expect(dragonborn?.variants).toHaveLength(10);
    for (const variant of dragonborn?.variants ?? []) {
      expect(variant.abilityIncreases ?? []).toHaveLength(0);
    }
  });

  it("species+variant increases are additive (Dwarf +2 CON species-level, Hill Dwarf +1 WIS variant-level)", () => {
    const dwarf = roster2014.find((s) => s.name === "Dwarf");
    expect(dwarf?.abilityIncreases).toEqual([{ ability: "constitution", amount: 2 }]);
    const hillDwarf = dwarf?.variants?.find((v) => v.name === "Hill Dwarf");
    expect(hillDwarf?.abilityIncreases).toEqual([{ ability: "wisdom", amount: 1 }]);
  });
});

describe("2024 roster (PHB'24)", () => {
  const roster2024 = speciesFor("EDITION_2024");

  it("contains exactly the 10 PHB'24 species, no more, no fewer", () => {
    expect(roster2024.map((s) => s.name).sort()).toEqual([...PHB24_ROSTER].sort());
  });

  it("excludes Half-Elf and Half-Orc (removed in PHB'24)", () => {
    const names = roster2024.map((s) => s.name);
    expect(names).not.toContain("Half-Elf");
    expect(names).not.toContain("Half-Orc");
  });

  it("canary: Dwarf is 30 ft in PHB'24 (vs. 25 ft in PHB'14)", () => {
    const dwarf = roster2024.find((s) => s.name === "Dwarf");
    expect(dwarf?.speed).toBe(30);
  });

  it("every species is 30 ft except Goliath at 35 ft", () => {
    for (const species of roster2024) {
      const expected = species.name === "Goliath" ? 35 : 30;
      expect(species.speed, species.name).toBe(expected);
    }
  });

  it("no 2024 species carries an ability increase — that's backgrounds only (#1572)", () => {
    for (const species of roster2024) {
      expect(species.abilityIncreases ?? [], species.name).toHaveLength(0);
      for (const variant of species.variants ?? []) {
        expect(variant.abilityIncreases ?? [], `${species.name} > ${variant.name}`).toHaveLength(0);
      }
    }
  });

  it("Dragonborn carries the 10 draconic ancestry variants (epic review decision 7)", () => {
    const dragonborn = roster2024.find((s) => s.name === "Dragonborn");
    expect(dragonborn?.variants).toHaveLength(10);
    const expectedNames = [
      "Black Dragonborn", "Blue Dragonborn", "Brass Dragonborn", "Bronze Dragonborn", "Copper Dragonborn",
      "Gold Dragonborn", "Green Dragonborn", "Red Dragonborn", "Silver Dragonborn", "White Dragonborn",
    ].sort();
    expect(dragonborn?.variants?.map((v) => v.name).sort()).toEqual(expectedNames);
    // Same 10 dragon types in BOTH editions (epic review decision 7).
    const dragonborn2014 = speciesFor("EDITION_2014").find((s) => s.name === "Dragonborn");
    expect(dragonborn2014?.variants?.map((v) => v.name).sort()).toEqual(expectedNames);
  });

  it("#1683: seeds the Elf/Gnome/Tiefling lineage-legacy variants and the Goliath Giant Ancestry variants", () => {
    const variantNames = (name: string) => roster2024.find((s) => s.name === name)?.variants?.map((v) => v.name).sort();
    expect(variantNames("Elf")).toEqual(["Drow", "High Elf", "Wood Elf"]);
    expect(variantNames("Gnome")).toEqual(["Forest Gnome", "Rock Gnome"]);
    expect(variantNames("Tiefling")).toEqual(["Abyssal Legacy", "Chthonic Legacy", "Infernal Legacy"]);
    expect(variantNames("Goliath")).toEqual(
      ["Cloud's Jaunt", "Fire's Burn", "Frost's Chill", "Hill's Tumble", "Stone's Endurance", "Storm's Thunder"].sort(),
    );
  });

  it("#1683: Wood Elf overrides speed to 35 ft (SRD 5.2 Fleet of Foot); no other new 2024 variant overrides speed", () => {
    const elf = roster2024.find((s) => s.name === "Elf");
    const woodElf = elf?.variants?.find((v) => v.name === "Wood Elf");
    expect(woodElf?.speedOverride).toBe(35);
    for (const variant of elf?.variants ?? []) {
      if (variant.name !== "Wood Elf") expect(variant.speedOverride, variant.name).toBeUndefined();
    }
  });

  it("#1683: Aasimar carries no variants — Celestial Revelation is a level-3 in-play choice, not a creation lineage", () => {
    const aasimar = roster2024.find((s) => s.name === "Aasimar");
    expect(aasimar?.variants ?? []).toHaveLength(0);
  });
});

describe("both rosters", () => {
  it("no duplicate (slug, edition) pair", () => {
    const keys = SPECIES.map((s) => `${s.slug}::${s.edition}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Dwarf/Elf/Halfling/Gnome/Human/Dragonborn/Tiefling appear once per edition, at most twice total", () => {
    for (const name of ["Dwarf", "Elf", "Halfling", "Gnome", "Human", "Dragonborn", "Tiefling"]) {
      const rows = SPECIES.filter((s) => s.name === name);
      expect(rows, name).toHaveLength(2);
      expect(rows.map((r) => r.edition).sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
    }
  });
});
