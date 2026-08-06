// Pure 5e-rules sanity checks on SPECIES_TRAITS (#1682) — no database, same
// role as species-data.test.ts. Guards the derived-vs-announce-only split the
// issue names explicitly: Dwarven Toughness/Dwarven (Armor|Combat) Training/
// Elf Weapon Training are the ONLY improvement-bearing rows; everything else
// (including darkvision, owner ruling) is announce-only cited text.
import { describe, it, expect } from "vitest";

import { SPECIES } from "../species-data.js";
import { SPECIES_TRAITS, speciesTraitSeedSchema } from "../species-traits-data.js";

describe("SPECIES_TRAITS — every row validates", () => {
  it("every row satisfies speciesTraitSeedSchema", () => {
    for (const [index, trait] of SPECIES_TRAITS.entries()) {
      const result = speciesTraitSeedSchema.safeParse(trait);
      expect(result.success, `SPECIES_TRAITS[${index}] (${trait.name}): ${result.success ? "" : result.error.message}`).toBe(true);
    }
  });

  it("every (speciesSlug, speciesEdition) resolves against SPECIES, every variantSlug against that species' own variants", () => {
    for (const [index, trait] of SPECIES_TRAITS.entries()) {
      const species = SPECIES.find((s) => s.slug === trait.speciesSlug && s.edition === trait.speciesEdition);
      expect(species, `SPECIES_TRAITS[${index}] (${trait.name}) references unknown species "${trait.speciesSlug}" (${trait.speciesEdition})`).toBeDefined();
      if (trait.variantSlug) {
        const variant = species?.variants?.find((v) => v.slug === trait.variantSlug);
        expect(variant, `SPECIES_TRAITS[${index}] (${trait.name}) references unknown variant "${trait.variantSlug}"`).toBeDefined();
      }
    }
  });

  it("no duplicate (speciesSlug, speciesEdition, variantSlug, name)", () => {
    const keys = SPECIES_TRAITS.map((t) => `${t.speciesSlug}::${t.speciesEdition}::${t.variantSlug ?? "null"}::${t.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every description cites a source (SRD/PHB, or SJ:AAG for the non-SRD Astral Elf, #1751)", () => {
    for (const trait of SPECIES_TRAITS) {
      expect(trait.description, trait.name).toMatch(/SRD 5\.[12]|PHB'(14|24)|SJ:AAG/);
    }
  });
});

describe("Astral Elf variant traits (#1751, Spelljammer / SJ:AAG)", () => {
  const astralTraits = SPECIES_TRAITS.filter(
    (t) => t.speciesSlug === "elf" && t.speciesEdition === "EDITION_2014" && t.variantSlug === "astral",
  );

  it("seeds Astral Fire, Starlight Step, and Astral Trance", () => {
    expect(astralTraits.map((t) => t.name).sort()).toEqual(["Astral Fire", "Astral Trance", "Starlight Step"]);
  });

  it("every Astral Elf trait carries no improvements and cites SJ:AAG", () => {
    expect(astralTraits.length).toBeGreaterThan(0);
    for (const trait of astralTraits) {
      expect(trait.improvements ?? [], trait.name).toHaveLength(0);
      expect(trait.description, trait.name).toContain("SJ:AAG");
    }
  });

  it("carries no Astral-specific Keen Senses row — the fixed Perception grant is now the base species-level trait Astral inherits (#1754 dup guard)", () => {
    const astralKeenSenses = SPECIES_TRAITS.filter(
      (t) => t.speciesSlug === "elf" && t.variantSlug === "astral" && t.name === "Keen Senses",
    );
    expect(astralKeenSenses).toHaveLength(0);
  });

  it("Astral Fire is the only Astral Elf trait carrying a choice (#1756), still with no improvements", () => {
    const withChoice = astralTraits.filter((t) => t.choice !== undefined).map((t) => t.name);
    expect(withChoice).toEqual(["Astral Fire"]);
    const astralFire = astralTraits.find((t) => t.name === "Astral Fire");
    expect(astralFire?.improvements ?? []).toHaveLength(0);
  });
});

describe("derived subset — the ONLY traits carrying `improvements` (issue #1682's stated scope)", () => {
  const withImprovements = SPECIES_TRAITS.filter((t) => (t.improvements ?? []).length > 0);

  it("is exactly: Dwarven Toughness (both editions), Dwarven (Combat|Armor) Training, Elf/Drow Weapon Training", () => {
    const names = withImprovements.map((t) => `${t.speciesSlug}::${t.speciesEdition}::${t.variantSlug ?? "base"}::${t.name}`).sort();
    expect(names).toEqual(
      [
        "dwarf::EDITION_2014::base::Dwarven Combat Training",
        "dwarf::EDITION_2014::hill::Dwarven Toughness",
        "dwarf::EDITION_2014::mountain::Dwarven Armor Training",
        "dwarf::EDITION_2024::base::Dwarven Toughness",
        "elf::EDITION_2014::base::Keen Senses",
        "elf::EDITION_2014::drow::Drow Weapon Training",
        "elf::EDITION_2014::high::Elf Weapon Training",
        "elf::EDITION_2014::wood::Elf Weapon Training",
      ].sort(),
    );
  });

  it("base 2014 Elf's Keen Senses grants a fixed Perception skill proficiency, a derived skillProficiency improvement (SRD 5.1 p. 21, #1754)", () => {
    const keenSenses = SPECIES_TRAITS.find(
      (t) => t.speciesSlug === "elf" && t.speciesEdition === "EDITION_2014" && !t.variantSlug && t.name === "Keen Senses",
    );
    expect(keenSenses?.improvements).toEqual([{ target: "skillProficiency", amount: 1, key: "perception" }]);
  });

  it("Hill Dwarf's Dwarven Toughness is a perLevel maxHp improvement, +1", () => {
    const hillToughness = SPECIES_TRAITS.find((t) => t.speciesSlug === "dwarf" && t.variantSlug === "hill" && t.name === "Dwarven Toughness");
    expect(hillToughness?.improvements).toEqual([{ target: "maxHp", amount: 1, perLevel: true }]);
  });

  it("2024 Dwarf's own Dwarven Toughness (a base-species trait, not variant-gated) is the same perLevel maxHp improvement", () => {
    const dwarfToughness2024 = SPECIES_TRAITS.find((t) => t.speciesSlug === "dwarf" && t.speciesEdition === "EDITION_2024" && t.name === "Dwarven Toughness");
    expect(dwarfToughness2024?.variantSlug).toBeUndefined();
    expect(dwarfToughness2024?.improvements).toEqual([{ target: "maxHp", amount: 1, perLevel: true }]);
  });

  it("Mountain Dwarf's Dwarven Armor Training grants light + medium armor proficiency", () => {
    const mountainArmor = SPECIES_TRAITS.find((t) => t.speciesSlug === "dwarf" && t.variantSlug === "mountain");
    expect(mountainArmor?.improvements).toEqual([
      { target: "armorProficiency", amount: 1, key: "light" },
      { target: "armorProficiency", amount: 1, key: "medium" },
    ]);
  });

  it("base Dwarf's Dwarven Combat Training grants battleaxe/handaxe/light hammer/warhammer weapon proficiency", () => {
    const combatTraining = SPECIES_TRAITS.find((t) => t.speciesSlug === "dwarf" && t.speciesEdition === "EDITION_2014" && !t.variantSlug && t.name === "Dwarven Combat Training");
    expect(combatTraining?.improvements?.map((i) => i.key).sort()).toEqual(["Battleaxes", "Handaxes", "Light Hammers", "Warhammers"].sort());
  });

  it("darkvision carries NO improvements anywhere — announce-only per owner ruling (visible info, not a derived combat stat)", () => {
    const darkvisionRows = SPECIES_TRAITS.filter((t) => t.name === "Darkvision");
    expect(darkvisionRows.length).toBeGreaterThan(0);
    for (const row of darkvisionRows) expect(row.improvements ?? []).toHaveLength(0);
  });
});

describe("Dragonborn Draconic Ancestry trait content — both editions (epic review decision 7)", () => {
  it("seeds one combined trait row per dragon type, per edition — 10 x 2 = 20 rows", () => {
    const rows = SPECIES_TRAITS.filter((t) => t.speciesSlug === "dragonborn" && t.name.startsWith("Draconic Ancestry:"));
    expect(rows).toHaveLength(20);
    expect(rows.filter((r) => r.speciesEdition === "EDITION_2014")).toHaveLength(10);
    expect(rows.filter((r) => r.speciesEdition === "EDITION_2024")).toHaveLength(10);
  });

  it("2014 and 2024 breath-weapon text genuinely fork (transcription rule, ACTIONS/#1430 precedent) even for the same dragon type", () => {
    const red2014 = SPECIES_TRAITS.find((t) => t.speciesSlug === "dragonborn" && t.speciesEdition === "EDITION_2014" && t.variantSlug === "red");
    const red2024 = SPECIES_TRAITS.find((t) => t.speciesSlug === "dragonborn" && t.speciesEdition === "EDITION_2024" && t.variantSlug === "red");
    expect(red2014?.description).not.toBe(red2024?.description);
    expect(red2014?.description).toContain("SRD 5.1");
    expect(red2024?.description).toContain("PHB'24");
    // Damage type is edition-invariant (fire, both editions) even though shape/DC/frequency differ.
    expect(red2014?.description).toContain("fire");
    expect(red2024?.description).toContain("fire");
  });

  it("carries no improvements — self-or-announce (the breath weapon targets others)", () => {
    const rows = SPECIES_TRAITS.filter((t) => t.speciesSlug === "dragonborn" && t.name.startsWith("Draconic Ancestry:"));
    for (const row of rows) expect(row.improvements ?? [], row.name).toHaveLength(0);
  });
});

describe("choice-bearing traits (#1689/#1690/#1756) carry no improvements — the choice spec is the whole mechanic", () => {
  it("Half-Elf Skill Versatility, High Elf Cantrip, Astral Fire, 2024 Human Skillful/Versatile, and 2024 Elf Keen Senses carry no improvements", () => {
    const choiceBearing = [
      { speciesSlug: "half-elf", speciesEdition: "EDITION_2014" as const, name: "Skill Versatility" },
      { speciesSlug: "elf", speciesEdition: "EDITION_2014" as const, variantSlug: "high", name: "Cantrip" },
      { speciesSlug: "elf", speciesEdition: "EDITION_2014" as const, variantSlug: "astral", name: "Astral Fire" },
      { speciesSlug: "human", speciesEdition: "EDITION_2024" as const, name: "Skillful" },
      { speciesSlug: "human", speciesEdition: "EDITION_2024" as const, name: "Versatile" },
      { speciesSlug: "elf", speciesEdition: "EDITION_2024" as const, name: "Keen Senses" },
    ];
    for (const target of choiceBearing) {
      const row = SPECIES_TRAITS.find(
        (t) => t.speciesSlug === target.speciesSlug && t.speciesEdition === target.speciesEdition && t.name === target.name && t.variantSlug === target.variantSlug,
      );
      expect(row, `${target.speciesSlug}/${target.speciesEdition}/${target.name}`).toBeDefined();
      expect(row?.improvements ?? []).toHaveLength(0);
    }
  });
});

describe("#1689/#1690/#1756: choice-spec vocabulary lands on exactly six rows", () => {
  it("Half-Elf's own Skill Versatility row carries chooseSkills: count 2, no `from` restriction (SRD 5.1 places none)", () => {
    const skillVersatility = SPECIES_TRAITS.find((t) => t.speciesSlug === "half-elf" && t.name === "Skill Versatility");
    expect(skillVersatility?.choice).toEqual({ chooseSkills: { count: 2 } });
  });

  it("High Elf's own Cantrip row carries chooseCantrip: the wizard list, Intelligence casting ability (SRD 5.1 p. 24)", () => {
    const cantrip = SPECIES_TRAITS.find((t) => t.speciesSlug === "elf" && t.variantSlug === "high" && t.name === "Cantrip");
    expect(cantrip?.choice).toEqual({ chooseCantrip: { list: "wizard", castingAbility: "intelligence" } });
  });

  it("Astral Elf's own Astral Fire row carries chooseCantrip: an explicit 3-cantrip list, no fixed casting ability (SJ:AAG p. 10, #1756)", () => {
    const astralFire = SPECIES_TRAITS.find((t) => t.speciesSlug === "elf" && t.variantSlug === "astral" && t.name === "Astral Fire");
    expect(astralFire?.choice).toEqual({ chooseCantrip: { spells: ["Dancing Lights", "Light", "Sacred Flame"] } });
  });

  it("2024 Human's own Skillful row carries chooseSkills: count 1, no `from` restriction (SRD 5.2 places none, #1690)", () => {
    const skillful = SPECIES_TRAITS.find((t) => t.speciesSlug === "human" && t.speciesEdition === "EDITION_2024" && t.name === "Skillful");
    expect(skillful?.choice).toEqual({ chooseSkills: { count: 1 } });
  });

  it("2024 Human's own Versatile row carries chooseOriginFeat: true (#1690)", () => {
    const versatile = SPECIES_TRAITS.find((t) => t.speciesSlug === "human" && t.speciesEdition === "EDITION_2024" && t.name === "Versatile");
    expect(versatile?.choice).toEqual({ chooseOriginFeat: true });
  });

  it("2024 Elf's own Keen Senses row carries chooseSkills: count 1, restricted to Insight/Perception/Survival (SRD 5.2 p. 24, #1690)", () => {
    const keenSenses = SPECIES_TRAITS.find((t) => t.speciesSlug === "elf" && t.speciesEdition === "EDITION_2024" && t.name === "Keen Senses");
    expect(keenSenses?.choice).toEqual({ chooseSkills: { count: 1, from: ["insight", "perception", "survival"] } });
  });

  it("no other row carries a `choice`", () => {
    const withChoice = SPECIES_TRAITS.filter((t) => t.choice !== undefined);
    const names = withChoice.map((t) => `${t.speciesSlug}::${t.speciesEdition}::${t.variantSlug ?? "base"}::${t.name}`).sort();
    expect(names).toEqual(
      [
        "elf::EDITION_2014::high::Cantrip",
        "elf::EDITION_2014::astral::Astral Fire",
        "half-elf::EDITION_2014::base::Skill Versatility",
        "human::EDITION_2024::base::Skillful",
        "human::EDITION_2024::base::Versatile",
        "elf::EDITION_2024::base::Keen Senses",
      ].sort(),
    );
  });
});
