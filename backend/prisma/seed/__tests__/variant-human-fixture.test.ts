// Proves the epic's AC for #1690: Variant Human (PHB'14 p. 31) is expressible
// with the existing choice vocabulary as pure seed content — no schema or
// mechanism change needed, just rows. NOT shipped as real SPECIES/
// SPECIES_TRAITS content this wave (a future wave's scope, per the epic
// review decision cited in species-traits-data.ts's file header); this is a
// test-authored fixture, created and torn down here, mirroring
// species-floating-spread-fixture.test.ts's (#1679) Astral Elf precedent.
//
// Variant Human's three creation-time choices, each a real row against the
// SAME vocabulary the seeded 2014/2024 content uses:
//   - "+1 to two ability scores of your choice" -> Species.abilityIncreases:
//     [{ choose: { count: 2, amount: 1 } }] (species-ability-increases.ts,
//     #1679/#1681 — no `from` restriction, same shape as Half-Elf's own).
//   - "one skill proficiency of your choice" -> a SpeciesTrait row with
//     choice: { chooseSkills: { count: 1 } } (#1689, unrestricted like 2024
//     Human's own Skillful).
//   - "one feat of your choice" -> a SpeciesTrait row with
//     choice: { chooseOriginFeat: true } (#1690's new spec form). PHB'14's
//     Variant Human feat is any feat the character qualifies for, not
//     specifically an Origin-category one — chooseOriginFeat's create-time
//     validation (resolveSpeciesOriginFeatGrant, character-create.ts) is
//     narrower than that, so this fixture proves the SPEC is expressible,
//     not that 2014 Variant Human's exact eligibility rule is already wired;
//     widening that validation is the future wave's own scope, not this one's.
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { abilityIncreasesSchema } from "@/lib/srd/species-ability-increases.js";
import { speciesTraitSeedSchema } from "../species-traits-data.js";

const FIXTURE_SLUG = "zzz-variant-human-fixture-1690";

afterEach(async () => {
  await prisma.species.deleteMany({ where: { slug: FIXTURE_SLUG } });
});

describe("Variant Human fixture (PHB'14 p. 31, #1690 no-migration/no-new-vocabulary AC)", () => {
  it("the three seed shapes each validate against the existing schemas", () => {
    const abilityIncreases = [{ choose: { count: 2, amount: 1 } }];
    expect(abilityIncreasesSchema.safeParse(abilityIncreases).success).toBe(true);

    const skillTrait = {
      speciesSlug: FIXTURE_SLUG,
      speciesEdition: "EDITION_2014" as const,
      name: "Skilled",
      description: "You gain proficiency in one skill of your choice. (PHB'14 p. 31, fixture)",
      choice: { chooseSkills: { count: 1 } },
    };
    expect(speciesTraitSeedSchema.safeParse(skillTrait).success).toBe(true);

    const featTrait = {
      speciesSlug: FIXTURE_SLUG,
      speciesEdition: "EDITION_2014" as const,
      name: "Feat",
      description: "You gain one feat of your choice. (PHB'14 p. 31, fixture)",
      choice: { chooseOriginFeat: true as const },
    };
    expect(speciesTraitSeedSchema.safeParse(featTrait).success).toBe(true);
  });

  it("persists and round-trips a Species + two SpeciesTrait rows carrying the full Variant Human shape", async () => {
    const created = await prisma.species.create({
      data: {
        name: "Variant Human (fixture)",
        slug: FIXTURE_SLUG,
        speed: 30,
        edition: "EDITION_2014",
        abilityIncreases: [{ choose: { count: 2, amount: 1 } }],
        traits: {
          create: [
            {
              name: "Skilled",
              description: "You gain proficiency in one skill of your choice. (PHB'14 p. 31, fixture)",
              choice: { chooseSkills: { count: 1 } },
            },
            {
              name: "Feat",
              description: "You gain one feat of your choice. (PHB'14 p. 31, fixture)",
              choice: { chooseOriginFeat: true },
            },
          ],
        },
      },
      include: { traits: true },
    });

    expect(created.abilityIncreases).toEqual([{ choose: { count: 2, amount: 1 } }]);
    const choices = created.traits.map((t) => t.choice).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(choices).toEqual([{ chooseOriginFeat: true }, { chooseSkills: { count: 1 } }]);
  });
});
