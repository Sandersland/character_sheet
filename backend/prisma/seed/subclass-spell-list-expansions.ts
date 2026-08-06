// Content-as-data (#1631): the spells a subclass adds to the CHOOSABLE class
// spell list — categorically distinct from SUBCLASS_GRANTED_SPELLS
// (subclass-granted-spells.ts, always-prepared free grants). Each row
// REFERENCES the shared Spell catalog by name (resolved to a spellId at seed
// time), same as that sibling family. Carries no gateLevel/castingAbility
// (owner decision, #1631): the known-caster picker already gates a choice by
// spell level vs. available slots, and the caster learns the spell with its
// own casting ability, not a per-row one.
//
// PHB'14's Warlock patrons are the only content here today. Each patron's
// "Expanded Spell List" feature (warlock-features.ts is the authority for
// exact spell names) reads "Add <patron> spells to your warlock list" — the
// spells become legal CHOICES for a known caster's limited spells-known, and
// the warlock still spends a known-spell pick to learn them. They were
// wrongly seeded as SubclassGrantedSpell (free, always-prepared) rows before
// #1631; see that issue for the correction.
//
// The Fiend's Subclass row is edition-SHARED (offered in both 2014 and
// 2024), but its 2014 Expanded Spell List and its 2024 Fiend Spells
// (genuinely always-prepared, SRD 5.2's rename+rework) are different
// mechanisms over overlapping-but-not-identical lists — so every one of The
// Fiend's 10 rows below is tagged EDITION_2014, forking against the 10
// EDITION_2024 SubclassGrantedSpell rows in the sibling file. The Archfey and
// The Great Old One's Subclass rows are ALREADY EDITION_2014-only (#1233:
// their PHB'24 reworks are non-SRD and unverifiable), so their rows here
// would be 2014-only regardless of the mechanism question.
import { z } from "zod";

import type { SeedEdition } from "./edition.js";

export interface SubclassSpellListExpansionSeed {
  /** Must match a CLASSES entry name. */
  className: string;
  /** Must match a SUBCLASSES entry name (under className). */
  subclassName: string;
  /** Must match a SPELLS catalog entry by its unique name. */
  spellName: string;
  // Omitted = shared (NULL column, added to the list in both editions,
  // #1625's convention) — every row today is tagged, since no 2014/2024 pair
  // of patrons currently shares an identical list.
  edition?: SeedEdition;
}

// Validated at seed time (prisma/seed/validate.ts), same discipline as
// subclassGrantedSpellSeedSchema — catches a per-row SHAPE gap before
// seed-data.test.ts's referential-integrity checks or the DB-backed seeder
// (seed-spell-list-expansions.ts) ever run.
export const subclassSpellListExpansionSeedSchema = z.object({
  className: z.string().min(1),
  subclassName: z.string().min(1),
  spellName: z.string().min(1),
  edition: z.enum(["EDITION_2014", "EDITION_2024"]).optional(),
});

export const SUBCLASS_SPELL_LIST_EXPANSIONS: SubclassSpellListExpansionSeed[] = [
  // The Fiend (Warlock) — PHB'14 "Expanded Spell List", warlock-features.ts's
  // FIEND_RAW EDITION_2014 row: "Burning Hands, Command (1st); Blindness/
  // Deafness, Scorching Ray (2nd); Fireball, Stinking Cloud (3rd); Fire
  // Shield, Wall of Fire (4th); Flame Strike, Hallow (5th)" — tiers are SPELL
  // levels there, irrelevant here (this table carries no gate).
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

  // The Archfey (Warlock) — PHB'14 "Expanded Spell List", warlock-features.ts's
  // ARCHFEY_RAW: "Faerie Fire, Sleep (1st); Calm Emotions, Phantasmal Force
  // (2nd); Blink, Plant Growth (3rd); Dominate Beast, Greater Invisibility
  // (4th); Dominate Person, Seeming (5th)".
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

  // The Great Old One (Warlock) — PHB'14 "Expanded Spell List",
  // warlock-features.ts's GREAT_OLD_ONE_RAW: "Dissonant Whispers, Hideous
  // Laughter (1st); Detect Thoughts, Phantasmal Force (2nd); Clairvoyance,
  // Sending (3rd); Dominate Beast, Black Tentacles (4th); Dominate Person,
  // Telekinesis (5th)".
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
