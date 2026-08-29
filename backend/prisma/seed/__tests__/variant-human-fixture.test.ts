// Proves #1690's AC: Variant Human (PHB'14 p. 31) is expressible with the existing choice vocabulary as pure seed rows, not shipped as real content this wave.
// chooseOriginFeat's create-time validation (resolveSpeciesOriginFeatGrant) is narrower than PHB'14's actual any-feat rule; this fixture proves the spec is expressible, not that eligibility is fully wired.
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
