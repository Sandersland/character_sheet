// Choosable class spell-list additions — distinct from SUBCLASS_GRANTED_SPELLS, which are always-prepared free grants.
// Carries no gateLevel/castingAbility: the known-caster picker gates by spell level vs. available slots, and the caster uses their own casting ability (#1631).
//
// The Fiend's Subclass row is edition-shared, but its 2014 Expanded Spell List and 2024 Fiend Spells are different mechanisms over overlapping-but-not-identical lists, so these rows fork EDITION_2014 against the sibling SubclassGrantedSpell rows.
// The Archfey and The Great Old One's Subclass rows are already EDITION_2014-only: their PHB'24 reworks are non-SRD and unverifiable (#1233).
import { z } from "zod";

import type { SeedEdition } from "./edition.js";

export interface SubclassSpellListExpansionSeed {
  /** Must match a CLASSES entry name. */
  className: string;
  /** Must match a SUBCLASSES entry name (under className). */
  subclassName: string;
  /** Must match a SPELLS catalog entry by its unique name. */
  spellName: string;
  // Omitted = shared (NULL column, added in both editions, #1625); every row today is tagged since no patron pair shares an identical list.
  edition?: SeedEdition;
}

export const subclassSpellListExpansionSeedSchema = z.object({
  className: z.string().min(1),
  subclassName: z.string().min(1),
  spellName: z.string().min(1),
  edition: z.enum(["EDITION_2014", "EDITION_2024"]).optional(),
});

export const SUBCLASS_SPELL_LIST_EXPANSIONS: SubclassSpellListExpansionSeed[] = [
  // PHB'14 Warlock "Expanded Spell List" (The Fiend).
  { className: "Warlock", subclassName: "The Fiend", spellName: "Burning Hands", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Command", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Blindness/Deafness", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Scorching Ray", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Fireball", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Stinking Cloud", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Fire Shield", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Wall of Fire", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Flame Strike", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Hallow", edition: "EDITION_2014" },

  // PHB'14 Warlock "Expanded Spell List" (The Archfey).
  { className: "Warlock", subclassName: "The Archfey", spellName: "Faerie Fire", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Sleep", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Calm Emotions", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Phantasmal Force", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Blink", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Plant Growth", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Dominate Beast", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Greater Invisibility", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Dominate Person", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Seeming", edition: "EDITION_2014" },

  // PHB'14 Warlock "Expanded Spell List" (The Great Old One).
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Dissonant Whispers", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Hideous Laughter", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Detect Thoughts", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Phantasmal Force", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Clairvoyance", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Sending", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Dominate Beast", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Black Tentacles", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Dominate Person", edition: "EDITION_2014" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Telekinesis", edition: "EDITION_2014" },
];
