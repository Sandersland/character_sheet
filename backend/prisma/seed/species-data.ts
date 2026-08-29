// Pure data, no Prisma, no side effects — the upsert logic lives in seedSpecies (seed-species.ts).
// 2014 species use the full PHB'14 subrace list (SRD 5.1 covers only one subrace per race).
import { z } from "zod";

import { abilityIncreasesSchema, type AbilityIncreaseSpec } from "../../src/lib/srd/species-ability-increases.js";
import type { SeedEdition } from "./edition.js";

export interface SpeciesVariantSeed {
  name: string;
  slug: string;
  speedOverride?: number;
  abilityIncreases?: AbilityIncreaseSpec[];
  // When true, abilityIncreases REPLACES the parent species' increases instead of stacking on them at creation (#1751 — Astral Elf). Omit (= additive) for every real subrace.
  abilityIncreasesReplace?: boolean;
}

export interface SpeciesSeed {
  name: string;
  slug: string;
  speed: number;
  edition: SeedEdition;
  abilityIncreases?: AbilityIncreaseSpec[];
  variants?: SpeciesVariantSeed[];
}

// Unlike Subclass/Feat/Background's optional `edition` (#1306's "NULL = shared" convention), `edition` here is REQUIRED — a species row with no edition is a bug, never "valid in both".
const speciesVariantSeedSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1),
    speedOverride: z.number().int().positive().optional(),
    abilityIncreases: abilityIncreasesSchema.optional(),
    abilityIncreasesReplace: z.boolean().optional(),
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

// The 10 Draconic Ancestry dragon types (SRD 5.1 p.33 table / SRD 5.2 p.39 table) — identical list in both editions; only the damage type/breath-weapon shape per type ever forks.
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
      // Astral Elf (Spelljammer, non-SRD/non-PHB, #1751): modelled as an Elf variant, but its ability increase is the floating Tasha's-era pool ({ floating: 3 }), which REPLACES the base Elf's +2 DEX via abilityIncreasesReplace since it is not a PHB elf subrace.
      {
        name: "Astral Elf",
        slug: "astral",
        abilityIncreases: [{ floating: 3 }],
        abilityIncreasesReplace: true,
      },
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
    // Variant Human is not yet seeded.
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

// #1683: 2024 lineage/legacy/ancestry variants — SpeciesGrantedSpell content lives in SPECIES_GRANTED_SPELLS; announce-text trait rows (resistances, framing, Superior Darkvision) live in SPECIES_TRAITS.
// Aasimar's Celestial Revelation is deliberately not modelled here (SRD 5.2 p.12/PHB'24 p.16): it's a Bonus Action transformation re-chosen every use, not a creation-time lineage pick.
function elfLineageVariants(): SpeciesVariantSeed[] {
  return [
    { name: "Drow", slug: "drow" },
    { name: "High Elf", slug: "high" },
    { name: "Wood Elf", slug: "wood", speedOverride: 35 }, // SRD 5.2 p. 24: Fleet of Foot
  ];
}

function gnomishLineageVariants(): SpeciesVariantSeed[] {
  return [
    { name: "Forest Gnome", slug: "forest" },
    { name: "Rock Gnome", slug: "rock" },
  ];
}

function fiendishLegacyVariants(): SpeciesVariantSeed[] {
  return [
    { name: "Abyssal Legacy", slug: "abyssal" },
    { name: "Chthonic Legacy", slug: "chthonic" },
    { name: "Infernal Legacy", slug: "infernal" },
  ];
}

// SRD 5.2 p.32's Giant Ancestry table — six benefits, one chosen at creation; the book allows re-selecting on level up, but the app bakes the creation pick (#1681's no-reversible-delta shape). No abilityIncreases and no SpeciesGrantedSpell rows — pure trait content.
function giantAncestryVariants(): SpeciesVariantSeed[] {
  return [
    { name: "Cloud's Jaunt", slug: "cloud" },
    { name: "Fire's Burn", slug: "fire" },
    { name: "Frost's Chill", slug: "frost" },
    { name: "Hill's Tumble", slug: "hill" },
    { name: "Stone's Endurance", slug: "stone" },
    { name: "Storm's Thunder", slug: "storm" },
  ];
}

// PHB'24/SRD 5.2: no species carries an ability increase (backgrounds do, #1572). Every speed is 30 ft except Goliath's 35 ft (SRD 5.2's own stated exception).
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
  { name: "Elf", slug: "elf", speed: 30, edition: "EDITION_2024", variants: elfLineageVariants() },
  { name: "Gnome", slug: "gnome", speed: 30, edition: "EDITION_2024", variants: gnomishLineageVariants() },
  { name: "Goliath", slug: "goliath", speed: 35, edition: "EDITION_2024", variants: giantAncestryVariants() },
  { name: "Halfling", slug: "halfling", speed: 30, edition: "EDITION_2024" },
  { name: "Human", slug: "human", speed: 30, edition: "EDITION_2024" },
  { name: "Orc", slug: "orc", speed: 30, edition: "EDITION_2024" },
  { name: "Tiefling", slug: "tiefling", speed: 30, edition: "EDITION_2024", variants: fiendishLegacyVariants() },
];

export const SPECIES: SpeciesSeed[] = [...SPECIES_2014, ...SPECIES_2024];
