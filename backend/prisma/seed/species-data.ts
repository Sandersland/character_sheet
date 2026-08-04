// Species catalog seed data (#1679, epic #1518) — pure data, no Prisma, no
// side effects (same split as catalog-data.ts's CLASSES/BACKGROUNDS). Executable
// upsert logic lives in seed-species.ts, mirroring subclasses.ts/seed-
// subclasses.ts's split.
//
// Wave-1 rosters only (epic body "Owner decisions" 6 / review decision 9):
// 2014 = the 9 PHB'14 races with the FULL PHB'14 subrace list (exceeds SRD
// 5.1, which carries one subrace per race). Variant Human is EXCLUDED (wave 2,
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
// #1683 (slice 6): the remaining 2024 lineage/legacy/ancestry variants — Elf
// (Drow/High Elf/Wood Elf), Gnome (Forest/Rock), Tiefling (Abyssal/Chthonic/
// Infernal), Goliath (the six Giant Ancestry benefits) — via the elfLineage
// Variants/gnomishLineageVariants/fiendishLegacyVariants/giantAncestryVariants
// helpers below. Every 2024 species row's `abilityIncreases` is `[]` (species
// or variant): 2024 ability increases come from backgrounds only (#1572),
// never species — pinned by a negative test in species-data.test.ts.
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

// #1683: the 2024 lineage/legacy/ancestry variants — identity rows only (name
// + slug [+ speedOverride for Wood Elf]), never an abilityIncreases entry (no
// 2024 species/variant ever grants one, #1572). The spell-granting rows'
// actual SpeciesGrantedSpell content lives in species-granted-spells-data.ts;
// their announce-text trait rows (resistances, Fiendish Legacy/Giant Ancestry
// framing, Superior Darkvision) live in species-traits-data.ts. Aasimar's
// Celestial Revelation is deliberately NOT here — verified against SRD 5.2 p.
// 12/PHB'24 p. 16 (2026-08-04 research pass): it's a Bonus Action transformation
// unlocked at character level 3 and re-chosen every time you use it, not a
// creation-time lineage pick — see the PR description for the full ruling.
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

// SRD 5.2 p. 32's Giant Ancestry table — six benefits, one chosen at creation
// (re-selectable on a level up per the book, but the app bakes the creation
// pick like every other species choice, #1681's "no reversible delta" shape).
// No abilityIncreases (never one in 2024) and no SpeciesGrantedSpell rows
// (none of the six benefits cast a spell) — pure trait content, #1682-shaped.
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
  { name: "Elf", slug: "elf", speed: 30, edition: "EDITION_2024", variants: elfLineageVariants() },
  { name: "Gnome", slug: "gnome", speed: 30, edition: "EDITION_2024", variants: gnomishLineageVariants() },
  { name: "Goliath", slug: "goliath", speed: 35, edition: "EDITION_2024", variants: giantAncestryVariants() },
  { name: "Halfling", slug: "halfling", speed: 30, edition: "EDITION_2024" },
  { name: "Human", slug: "human", speed: 30, edition: "EDITION_2024" },
  { name: "Orc", slug: "orc", speed: 30, edition: "EDITION_2024" },
  { name: "Tiefling", slug: "tiefling", speed: 30, edition: "EDITION_2024", variants: fiendishLegacyVariants() },
];

export const SPECIES: SpeciesSeed[] = [...SPECIES_2014, ...SPECIES_2024];
