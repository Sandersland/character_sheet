// The content half of SpeciesGrantedSpell (#1683) — data here, executable upsert in seedSpeciesGrantedSpells.
// Unlike SubclassGrantedSpell, a row here carries no `castingAbility` (the column doesn't exist on SpeciesGrantedSpell) and no `edition` (species children inherit edition through their parent Species row).
// The lineage's Int/Wis/Cha choice is made once, per character, when the lineage is picked, and snapshotted onto CharacterRace.castingAbility — every row below inherits that one value at read time (buildSpeciesGrantedSpellSource), never a fixed catalog value.
// Elf Lineages SRD 5.2 p.24-25, Gnomish Lineages p.30-31, Fiendish Legacy p.47. Per-day free casting of the gate-3/5 spells is #1628's mechanism — these rows grant always-prepared + announce text until then.
import { z } from "zod";

export interface SpeciesGrantedSpellSeed {
  // Must match a SPECIES entry's slug, scoped by edition.
  speciesSlug: string;
  speciesEdition: "EDITION_2024";
  // Must match a SpeciesVariantSeed.slug scoped to this species — every 2024 spell-granting row this slice is variant-level.
  variantSlug: string;
  // Must match a SPELLS catalog entry by its unique name.
  spellName: string;
  // Character level at which the grant activates (1/3/5 for every lineage and legacy this slice; Gnomish Lineages grant both their rows at 1).
  gateLevel: number;
}

// Validated at seed time (assertSeedContentValid), like subclassGrantedSpellSeedSchema.
export const speciesGrantedSpellSeedSchema = z
  .object({
    speciesSlug: z.string().min(1),
    speciesEdition: z.literal("EDITION_2024"),
    variantSlug: z.string().min(1),
    spellName: z.string().min(1),
    gateLevel: z.number().int().positive(),
  })
  .strict();

export const SPECIES_GRANTED_SPELLS: SpeciesGrantedSpellSeed[] = [
  // Elf — Drow Lineage (SRD 5.2 p. 24): Dancing Lights 1, Faerie Fire 3, Darkness 5.
  { speciesSlug: "elf", speciesEdition: "EDITION_2024", variantSlug: "drow", spellName: "Dancing Lights", gateLevel: 1 },
  { speciesSlug: "elf", speciesEdition: "EDITION_2024", variantSlug: "drow", spellName: "Faerie Fire", gateLevel: 3 },
  { speciesSlug: "elf", speciesEdition: "EDITION_2024", variantSlug: "drow", spellName: "Darkness", gateLevel: 5 },

  // Elf — High Elf Lineage (SRD 5.2 p. 25): Prestidigitation 1, Detect Magic 3, Misty Step 5.
  { speciesSlug: "elf", speciesEdition: "EDITION_2024", variantSlug: "high", spellName: "Prestidigitation", gateLevel: 1 },
  { speciesSlug: "elf", speciesEdition: "EDITION_2024", variantSlug: "high", spellName: "Detect Magic", gateLevel: 3 },
  { speciesSlug: "elf", speciesEdition: "EDITION_2024", variantSlug: "high", spellName: "Misty Step", gateLevel: 5 },

  // Elf — Wood Elf Lineage (SRD 5.2 p. 25): Druidcraft 1, Longstrider 3, Pass without Trace 5.
  { speciesSlug: "elf", speciesEdition: "EDITION_2024", variantSlug: "wood", spellName: "Druidcraft", gateLevel: 1 },
  { speciesSlug: "elf", speciesEdition: "EDITION_2024", variantSlug: "wood", spellName: "Longstrider", gateLevel: 3 },
  { speciesSlug: "elf", speciesEdition: "EDITION_2024", variantSlug: "wood", spellName: "Pass without Trace", gateLevel: 5 },

  // Gnome — Forest Gnome Lineage (SRD 5.2 p. 30): Minor Illusion + Speak with
  // Animals, both granted at level 1 (no leveled track for either lineage).
  { speciesSlug: "gnome", speciesEdition: "EDITION_2024", variantSlug: "forest", spellName: "Minor Illusion", gateLevel: 1 },
  { speciesSlug: "gnome", speciesEdition: "EDITION_2024", variantSlug: "forest", spellName: "Speak with Animals", gateLevel: 1 },

  // Gnome — Rock Gnome Lineage (SRD 5.2 p. 31): Mending + Prestidigitation.
  { speciesSlug: "gnome", speciesEdition: "EDITION_2024", variantSlug: "rock", spellName: "Mending", gateLevel: 1 },
  { speciesSlug: "gnome", speciesEdition: "EDITION_2024", variantSlug: "rock", spellName: "Prestidigitation", gateLevel: 1 },

  // Tiefling — Abyssal Legacy (SRD 5.2 p. 47): Poison Spray 1, Ray of Sickness 3, Hold Person 5.
  { speciesSlug: "tiefling", speciesEdition: "EDITION_2024", variantSlug: "abyssal", spellName: "Poison Spray", gateLevel: 1 },
  { speciesSlug: "tiefling", speciesEdition: "EDITION_2024", variantSlug: "abyssal", spellName: "Ray of Sickness", gateLevel: 3 },
  { speciesSlug: "tiefling", speciesEdition: "EDITION_2024", variantSlug: "abyssal", spellName: "Hold Person", gateLevel: 5 },

  // Tiefling — Chthonic Legacy (SRD 5.2 p. 47): Chill Touch 1, False Life 3, Ray of Enfeeblement 5.
  { speciesSlug: "tiefling", speciesEdition: "EDITION_2024", variantSlug: "chthonic", spellName: "Chill Touch", gateLevel: 1 },
  { speciesSlug: "tiefling", speciesEdition: "EDITION_2024", variantSlug: "chthonic", spellName: "False Life", gateLevel: 3 },
  { speciesSlug: "tiefling", speciesEdition: "EDITION_2024", variantSlug: "chthonic", spellName: "Ray of Enfeeblement", gateLevel: 5 },

  // Tiefling — Infernal Legacy (SRD 5.2 p. 47): Fire Bolt 1, Hellish Rebuke 3, Darkness 5.
  { speciesSlug: "tiefling", speciesEdition: "EDITION_2024", variantSlug: "infernal", spellName: "Fire Bolt", gateLevel: 1 },
  { speciesSlug: "tiefling", speciesEdition: "EDITION_2024", variantSlug: "infernal", spellName: "Hellish Rebuke", gateLevel: 3 },
  { speciesSlug: "tiefling", speciesEdition: "EDITION_2024", variantSlug: "infernal", spellName: "Darkness", gateLevel: 5 },
];
