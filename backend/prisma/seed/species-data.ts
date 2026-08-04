// Species catalog seed data (#1679, epic #1518) — pure data, no Prisma, no
// side effects (same split as catalog-data.ts's RACES/CLASSES). Executable
// upsert logic lives in seed-species.ts, mirroring subclasses.ts/seed-
// subclasses.ts's split.
//
// Wave-1 rosters only (epic body "Owner decisions" 6 / review decision 9):
// 2014 = the 9 PHB'14 races with the FULL PHB'14 subrace list (exceeds SRD
// 5.1, which carries one subrace per race — see RACES in catalog-data.ts,
// which already lists every one of these). Variant Human is EXCLUDED (wave 2,
// after #1690). 2024 = the 10 PHB'24 species; no Half-Elf/Half-Orc, adds
// Aasimar/Goliath/Orc. Every speed verified against SRD 5.1 / SRD 5.2 text
// (2026-08-04 research pass) — PHB'14 Dwarf 25 ft vs PHB'24 Dwarf 30 ft is
// the canary this epic names explicitly.
//
// Dragonborn's Draconic Ancestry is seeded as SpeciesVariant rows in BOTH
// editions (epic review decision 7) — same 10 dragon types (five chromatic,
// five metallic) in both PHB'14 and PHB'24; the breath-weapon/resistance
// TRAIT content each type grants is authored later (#1682/#1683), so these
// rows carry identity only (name + slug), no abilityIncreases (draconic
// ancestry has never granted an ability score bonus in either edition) and no
// speedOverride.
//
// No 2024 lineage/legacy/ancestry variants beyond Dragonborn are seeded here
// (Elf/Gnome/Tiefling/Goliath) — those are #1683's scope (slice 6), not this
// slice's. Every 2024 species row's `abilityIncreases` is `[]`: 2024 ability
// increases come from backgrounds only (#1572), never species — pinned by a
// negative test in species-data.test.ts.
import { z } from "zod";

import { abilityIncreasesSchema, type AbilityIncreaseSpec } from "../../src/lib/srd/species-ability-increases.js";
import type { SeedEdition } from "./edition.js";

export interface SpeciesVariantSeed {
  name: string;
  slug: string;
  speedOverride?: number;
  abilityIncreases?: AbilityIncreaseSpec[];
}

export interface SpeciesSeed {
  name: string;
  slug: string;
  speed: number;
  edition: SeedEdition;
  abilityIncreases?: AbilityIncreaseSpec[];
  variants?: SpeciesVariantSeed[];
}

// Validated at seed time (prisma/seed/validate.ts), same "fail the seed with a
// row-indexed message" role as subclassSeedSchema. Unlike Subclass/Feat/
// Background's optional `edition` (#1306's "NULL = shared" convention),
// `edition` here is REQUIRED — a species row with no edition is a bug, never
// "valid in both" (see Species's own schema comment). Not exported: nested
// inside speciesSeedSchema below, no cross-file consumer of the bare shape.
const speciesVariantSeedSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1),
    speedOverride: z.number().int().positive().optional(),
    abilityIncreases: abilityIncreasesSchema.optional(),
  })
  .strict();

export const speciesSeedSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1),
    speed: z.number().int().positive(),
    edition: z.enum(["EDITION_2014", "EDITION_2024"]),
    abilityIncreases: abilityIncreasesSchema.optional(),
    variants: z.array(speciesVariantSeedSchema).optional(),
  })
  .strict();

// The 10 PHB'14/PHB'24 Draconic Ancestry dragon types (SRD 5.1 p. 33 table /
// SRD 5.2 p. 39 table) — identical type list in both editions; only the
// damage type/breath-weapon shape per type (slice 4/6 content) ever forks.
const DRAGON_ANCESTRY_TYPES = [
  "Black",
  "Blue",
  "Brass",
  "Bronze",
  "Copper",
  "Gold",
  "Green",
  "Red",
  "Silver",
  "White",
] as const;

function dragonAncestryVariants(): SpeciesVariantSeed[] {
  return DRAGON_ANCESTRY_TYPES.map((type) => ({
    name: `${type} Dragonborn`,
    slug: type.toLowerCase(),
  }));
}

const SPECIES_2014: SpeciesSeed[] = [
  {
    name: "Dwarf",
    slug: "dwarf",
    speed: 25, // SRD 5.1 p. 18
    edition: "EDITION_2014",
    abilityIncreases: [{ ability: "constitution", amount: 2 }],
    variants: [
      { name: "Hill Dwarf", slug: "hill", abilityIncreases: [{ ability: "wisdom", amount: 1 }] },
      { name: "Mountain Dwarf", slug: "mountain", abilityIncreases: [{ ability: "strength", amount: 2 }] },
    ],
  },
  {
    name: "Elf",
    slug: "elf",
    speed: 30, // SRD 5.1 p. 21
    edition: "EDITION_2014",
    abilityIncreases: [{ ability: "dexterity", amount: 2 }],
    variants: [
      { name: "High Elf", slug: "high", abilityIncreases: [{ ability: "intelligence", amount: 1 }] },
      {
        name: "Wood Elf",
        slug: "wood",
        speedOverride: 35, // SRD 5.1: Wood Elf's Fleet of Foot raises speed to 35 ft
        abilityIncreases: [{ ability: "wisdom", amount: 1 }],
      },
      { name: "Drow", slug: "drow", abilityIncreases: [{ ability: "charisma", amount: 1 }] },
    ],
  },
  {
    name: "Halfling",
    slug: "halfling",
    speed: 25, // SRD 5.1 p. 27
    edition: "EDITION_2014",
    abilityIncreases: [{ ability: "dexterity", amount: 2 }],
    variants: [
      { name: "Lightfoot Halfling", slug: "lightfoot", abilityIncreases: [{ ability: "charisma", amount: 1 }] },
      { name: "Stout Halfling", slug: "stout", abilityIncreases: [{ ability: "constitution", amount: 1 }] },
    ],
  },
  {
    name: "Human",
    slug: "human",
    speed: 30, // SRD 5.1 p. 31
    edition: "EDITION_2014",
    // Variant Human excluded from wave 1 (epic review decision 9).
    abilityIncreases: [
      { ability: "strength", amount: 1 },
      { ability: "dexterity", amount: 1 },
      { ability: "constitution", amount: 1 },
      { ability: "intelligence", amount: 1 },
      { ability: "wisdom", amount: 1 },
      { ability: "charisma", amount: 1 },
    ],
  },
  {
    name: "Dragonborn",
    slug: "dragonborn",
    speed: 30, // SRD 5.1 p. 17
    edition: "EDITION_2014",
    abilityIncreases: [
      { ability: "strength", amount: 2 },
      { ability: "charisma", amount: 1 },
    ],
    variants: dragonAncestryVariants(),
  },
  {
    name: "Gnome",
    slug: "gnome",
    speed: 25, // SRD 5.1 p. 23
    edition: "EDITION_2014",
    abilityIncreases: [{ ability: "intelligence", amount: 2 }],
    variants: [
      { name: "Forest Gnome", slug: "forest", abilityIncreases: [{ ability: "dexterity", amount: 1 }] },
      { name: "Rock Gnome", slug: "rock", abilityIncreases: [{ ability: "constitution", amount: 1 }] },
    ],
  },
  {
    name: "Half-Elf",
    slug: "half-elf",
    speed: 30, // SRD 5.1 p. 25
    edition: "EDITION_2014",
    abilityIncreases: [
      { ability: "charisma", amount: 2 },
      {
        choose: {
          count: 2,
          amount: 1,
          from: ["strength", "dexterity", "constitution", "intelligence", "wisdom"],
        },
      },
    ],
  },
  {
    name: "Half-Orc",
    slug: "half-orc",
    speed: 30, // SRD 5.1 p. 26
    edition: "EDITION_2014",
    abilityIncreases: [
      { ability: "strength", amount: 2 },
      { ability: "constitution", amount: 1 },
    ],
  },
  {
    name: "Tiefling",
    slug: "tiefling",
    speed: 30, // SRD 5.1 p. 29
    edition: "EDITION_2014",
    abilityIncreases: [
      { ability: "intelligence", amount: 1 },
      { ability: "charisma", amount: 2 },
    ],
  },
];

// PHB'24/SRD 5.2: no species carries an ability increase (backgrounds do,
// #1572) — every row below has an empty (default) abilityIncreases. Every
// speed is 30 ft except Goliath's 35 ft (SRD 5.2's own stated exception).
const SPECIES_2024: SpeciesSeed[] = [
  { name: "Aasimar", slug: "aasimar", speed: 30, edition: "EDITION_2024" },
  {
    name: "Dragonborn",
    slug: "dragonborn",
    speed: 30,
    edition: "EDITION_2024",
    variants: dragonAncestryVariants(),
  },
  { name: "Dwarf", slug: "dwarf", speed: 30, edition: "EDITION_2024" }, // canary: 25 ft in 2014, 30 ft here
  // Elven Lineage (Drow/High Elf/Wood Elf) is #1683's scope, not this slice's.
  { name: "Elf", slug: "elf", speed: 30, edition: "EDITION_2024" },
  // Gnomish Lineage (Forest/Rock) is #1683's scope, not this slice's.
  { name: "Gnome", slug: "gnome", speed: 30, edition: "EDITION_2024" },
  // Giant Ancestry is #1683's scope, not this slice's.
  { name: "Goliath", slug: "goliath", speed: 35, edition: "EDITION_2024" },
  { name: "Halfling", slug: "halfling", speed: 30, edition: "EDITION_2024" },
  { name: "Human", slug: "human", speed: 30, edition: "EDITION_2024" },
  { name: "Orc", slug: "orc", speed: 30, edition: "EDITION_2024" },
  // Fiendish Legacy (Abyssal/Chthonic/Infernal) is #1683's scope, not this slice's.
  { name: "Tiefling", slug: "tiefling", speed: 30, edition: "EDITION_2024" },
];

export const SPECIES: SpeciesSeed[] = [...SPECIES_2014, ...SPECIES_2024];
