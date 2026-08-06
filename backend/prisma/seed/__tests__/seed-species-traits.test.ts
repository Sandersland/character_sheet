// DB-backed proof that seedSpeciesTraits (#1682) is idempotent and resolves
// its (speciesId, variantId) targets correctly — mirrors seed-species.test.ts's
// own idempotency proof, one level down (traits, not species/variants).
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";

import { seedSpeciesTraits } from "../seed-species-traits.js";
import { SPECIES_TRAITS } from "../species-traits-data.js";

describe("seedSpeciesTraits idempotency (#1682)", () => {
  it("running seedSpeciesTraits twice leaves the row count unchanged and preserves row identity", async () => {
    await seedSpeciesTraits(prisma);
    const countAfterFirst = await prisma.speciesTrait.count();
    const before = await prisma.speciesTrait.findFirstOrThrow({ where: { name: "Darkvision" } });

    await seedSpeciesTraits(prisma);
    const countAfterSecond = await prisma.speciesTrait.count();
    const after = await prisma.speciesTrait.findFirstOrThrow({ where: { id: before.id } });

    expect(countAfterSecond).toBe(countAfterFirst);
    expect(countAfterFirst).toBe(SPECIES_TRAITS.length);
    expect(after.description).toBe(before.description);
  });
});

describe("seeded trait rows served per (species, variant), directly off the DB", () => {
  it("2014 Hill Dwarf carries Dwarven Toughness with a perLevel maxHp improvement", async () => {
    const hillDwarf = await prisma.speciesVariant.findFirstOrThrow({
      where: { slug: "hill", species: { slug: "dwarf", edition: "EDITION_2014" } },
      include: { traits: true },
    });
    const toughness = hillDwarf.traits.find((t) => t.name === "Dwarven Toughness");
    expect(toughness?.improvements).toEqual([{ target: "maxHp", amount: 1, perLevel: true }]);
  });

  it("2014 Mountain Dwarf carries Dwarven Armor Training with light+medium armor proficiency", async () => {
    const mountainDwarf = await prisma.speciesVariant.findFirstOrThrow({
      where: { slug: "mountain", species: { slug: "dwarf", edition: "EDITION_2014" } },
      include: { traits: true },
    });
    const armorTraining = mountainDwarf.traits.find((t) => t.name === "Dwarven Armor Training");
    expect(armorTraining?.improvements).toEqual([
      { target: "armorProficiency", amount: 1, key: "light" },
      { target: "armorProficiency", amount: 1, key: "medium" },
    ]);
  });

  it("2014 base Dwarf carries Dwarven Combat Training (weapon proficiency) at the species level, not gated behind a variant", async () => {
    const dwarf = await prisma.species.findFirstOrThrow({
      where: { slug: "dwarf", edition: "EDITION_2014" },
      include: { traits: true },
    });
    const combatTraining = dwarf.traits.find((t) => t.name === "Dwarven Combat Training" && t.variantId === null);
    expect(combatTraining).toBeDefined();
    expect((combatTraining!.improvements as { key: string }[]).map((i) => i.key).sort()).toEqual(
      ["Battleaxes", "Handaxes", "Light Hammers", "Warhammers"].sort(),
    );
  });

  it("Dragonborn's 10 dragon-type variants each carry exactly one Draconic Ancestry trait row, in both editions", async () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const dragonborn = await prisma.species.findFirstOrThrow({
        where: { slug: "dragonborn", edition },
        include: { variants: { include: { traits: true } } },
      });
      expect(dragonborn.variants).toHaveLength(10);
      for (const variant of dragonborn.variants) {
        expect(variant.traits, `${variant.name} (${edition})`).toHaveLength(1);
        expect(variant.traits[0].name).toBe(`Draconic Ancestry: ${variant.name.replace(" Dragonborn", "")}`);
      }
    }
  });

  it("2014 and 2024 Draconic Ancestry text for the same dragon type differ (transcription-rule fork)", async () => {
    const red2014 = await prisma.speciesTrait.findFirstOrThrow({
      where: { name: "Draconic Ancestry: Red", variant: { species: { edition: "EDITION_2014" } } },
    });
    const red2024 = await prisma.speciesTrait.findFirstOrThrow({
      where: { name: "Draconic Ancestry: Red", variant: { species: { edition: "EDITION_2024" } } },
    });
    expect(red2014.description).not.toBe(red2024.description);
  });

  it("#1689: Half-Elf's Skill Versatility row persists its chooseSkills choice spec", async () => {
    const skillVersatility = await prisma.speciesTrait.findFirstOrThrow({
      where: { name: "Skill Versatility", species: { slug: "half-elf", edition: "EDITION_2014" } },
    });
    expect(skillVersatility.choice).toEqual({ chooseSkills: { count: 2 } });
  });

  it("#1689: High Elf's Cantrip row persists its chooseCantrip choice spec", async () => {
    const cantrip = await prisma.speciesTrait.findFirstOrThrow({
      where: { name: "Cantrip", variant: { slug: "high", species: { slug: "elf", edition: "EDITION_2014" } } },
    });
    expect(cantrip.choice).toEqual({ chooseCantrip: { list: "wizard", castingAbility: "intelligence" } });
  });

  it("#1689: a spec-less trait (Darkvision) persists a null choice column", async () => {
    const darkvision = await prisma.speciesTrait.findFirstOrThrow({ where: { name: "Darkvision" } });
    expect(darkvision.choice).toBeNull();
  });
});
