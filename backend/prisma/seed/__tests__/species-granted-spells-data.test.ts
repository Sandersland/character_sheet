import { describe, it, expect } from "vitest";

import { SPECIES_GRANTED_SPELLS, speciesGrantedSpellSeedSchema } from "../species-granted-spells-data.js";

describe("SPECIES_GRANTED_SPELLS — every row validates", () => {
  it("every row satisfies speciesGrantedSpellSeedSchema", () => {
    for (const [index, grant] of SPECIES_GRANTED_SPELLS.entries()) {
      const result = speciesGrantedSpellSeedSchema.safeParse(grant);
      expect(result.success, `SPECIES_GRANTED_SPELLS[${index}]: ${result.success ? "" : result.error.message}`).toBe(true);
    }
  });

  it("every row is EDITION_2024 (no 2014 species/subrace grants a spell)", () => {
    for (const grant of SPECIES_GRANTED_SPELLS) {
      expect(grant.speciesEdition).toBe("EDITION_2024");
    }
  });
});

describe("Drow lineage spell track (AC: Dancing Lights@1, Faerie Fire@3, Darkness@5)", () => {
  const drow = SPECIES_GRANTED_SPELLS.filter((g) => g.speciesSlug === "elf" && g.variantSlug === "drow");

  it("grants exactly these three spells at these three levels", () => {
    expect(drow.map((g) => [g.spellName, g.gateLevel])).toEqual([
      ["Dancing Lights", 1],
      ["Faerie Fire", 3],
      ["Darkness", 5],
    ]);
  });
});

describe("every lineage/legacy grants at least one spell", () => {
  const targets: [string, string][] = [
    ["elf", "drow"],
    ["elf", "high"],
    ["elf", "wood"],
    ["gnome", "forest"],
    ["gnome", "rock"],
    ["tiefling", "abyssal"],
    ["tiefling", "chthonic"],
    ["tiefling", "infernal"],
  ];

  it.each(targets)("%s > %s carries at least one grant", (speciesSlug, variantSlug) => {
    const rows = SPECIES_GRANTED_SPELLS.filter((g) => g.speciesSlug === speciesSlug && g.variantSlug === variantSlug);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("Goliath's ancestry variants grant no spells (none of the six benefits casts one)", () => {
    const goliathGrants = SPECIES_GRANTED_SPELLS.filter((g) => g.speciesSlug === "goliath");
    expect(goliathGrants).toHaveLength(0);
  });
});
