// Content-as-data (#898): the spells each subclass grants for free (always
// prepared). Each row REFERENCES the shared Spell catalog by name (resolved to a
// spellId at seed time) — the spell's text lives once, in the catalog, and is
// never snapshotted here. Adding a subclass's granted spells is adding rows to
// this array; no code changes. Homebrew subclasses will grant spells the same
// way once they own Subclass rows (#911).
//
// The official Paladin oath / Cleric domain / Warlock patron lists are seeded
// here (#913), referencing the L4–L5 catalog expansion (#912). Paladin oath
// spells gate at levels 3/5/9/13/17 (CHA), Cleric domain + Warlock expanded
// lists at 3/3/5/7/9 (Cleric WIS, Warlock CHA) — the 2024 subclass grant is 3
// (#1128), so the former level-1 rows now fire at 3 pending the content resweep (#1133).
//
// Per-row `edition` (#1625): omitted = shared (NULL column, served to both
// editions); a list that diverges forks into one row per edition. The Paladin
// oath / Cleric domain / Warlock patron lists below are still the 2014 texts
// on shared rows — re-authoring the four diverging 2024 lists is #1626's
// content pass, deliberately not this mechanism change.
import { z } from "zod";

import type { SeedEdition } from "./edition.js";

export interface SubclassGrantedSpellSeed {
  /** Must match a CLASSES entry name. */
  className: string;
  /** Must match a SUBCLASSES entry name (under className). */
  subclassName: string;
  /** Must match a SPELLS catalog entry by its unique name. */
  spellName: string;
  /** Character level at which the grant activates (the subclass grant level). */
  gateLevel: number;
  /** Ability the granted spells use for save DC / attack bonus. */
  castingAbility:
    | "strength"
    | "dexterity"
    | "constitution"
    | "intelligence"
    | "wisdom"
    | "charisma";
  // Omitted = shared (NULL column, granted in both editions, #1625). Only a
  // grant that exists in one edition (or diverges) sets this — same convention
  // as SubclassSeed/FeatSeed.
  edition?: SeedEdition;
}

// Validated at seed time (prisma/seed/validate.ts) — #1247's Elementalism bug
// (a seeded spell with no grant row) was a REFERENTIAL gap this schema can't
// catch on its own (that's seed-data.test.ts's job); this schema catches the
// per-row SHAPE gap (a typo'd castingAbility, an empty name) before either
// runs. The second family registered in validate.ts's SEED_FAMILIES —
// demonstrates the registry is genuinely one line per family, not asserted.
export const subclassGrantedSpellSeedSchema = z.object({
  className: z.string().min(1),
  subclassName: z.string().min(1),
  spellName: z.string().min(1),
  gateLevel: z.number().int().positive(),
  castingAbility: z.enum(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]),
  edition: z.enum(["EDITION_2014", "EDITION_2024"]).optional(),
});

export const SUBCLASS_GRANTED_SPELLS: SubclassGrantedSpellSeed[] = [
  // Warrior of Shadow (Monk) — Minor Illusion, migrated from the former in-code
  // MINOR_ILLUSION snapshot in lib/spellcasting/granted-spells.ts (#898).
  // EDITION_2024: the Warrior of * subclasses are the PHB'24/SRD 5.2 reworks
  // on shared Subclass rows, so without the tag this grant would leak to 2014
  // Monks once #1313/#1372 seed the 2014 Way of * content (#1625).
  {
    className: "Monk",
    subclassName: "Warrior of Shadow",
    spellName: "Minor Illusion",
    gateLevel: 3,
    castingAbility: "wisdom",
    edition: "EDITION_2024",
  },
  // Way of Shadow (Monk) — Shadow Arts (PHB'14 pp.79-80 — not in SRD 5.1,
  // #1502): "you gain the minor illusion cantrip if you don't already know
  // it," same L3/Wisdom shape as the 2024 grant above, on its OWN
  // EDITION_2014-tagged Subclass row (monk-way-of-shadow) so it never leaks
  // to a 2024 Warrior of Shadow monk or vice versa.
  {
    className: "Monk",
    subclassName: "Way of Shadow",
    spellName: "Minor Illusion",
    gateLevel: 3,
    castingAbility: "wisdom",
    edition: "EDITION_2014",
  },
  // Warrior of the Elements (Monk) — Manipulate Elements (L3) grants the
  // Elementalism cantrip (#1247, SRD 5.2 / PHB'24). EDITION_2024 for the same
  // reason as Warrior of Shadow above.
  {
    className: "Monk",
    subclassName: "Warrior of the Elements",
    spellName: "Elementalism",
    gateLevel: 3,
    castingAbility: "wisdom",
    edition: "EDITION_2024",
  },

  // Oath of Devotion (Paladin) — CHA, gated 3/5/9/13/17.
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Protection from Evil and Good", gateLevel: 3, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Sanctuary", gateLevel: 3, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Lesser Restoration", gateLevel: 5, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Zone of Truth", gateLevel: 5, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Beacon of Hope", gateLevel: 9, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Dispel Magic", gateLevel: 9, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Freedom of Movement", gateLevel: 13, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Guardian of Faith", gateLevel: 13, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Commune", gateLevel: 17, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Flame Strike", gateLevel: 17, castingAbility: "charisma" },

  // Oath of the Ancients (Paladin) — CHA, gated 3/5/9/13/17.
  { className: "Paladin", subclassName: "Oath of the Ancients", spellName: "Ensnaring Strike", gateLevel: 3, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of the Ancients", spellName: "Speak with Animals", gateLevel: 3, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of the Ancients", spellName: "Misty Step", gateLevel: 5, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of the Ancients", spellName: "Moonbeam", gateLevel: 5, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of the Ancients", spellName: "Plant Growth", gateLevel: 9, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of the Ancients", spellName: "Protection from Energy", gateLevel: 9, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of the Ancients", spellName: "Ice Storm", gateLevel: 13, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of the Ancients", spellName: "Stoneskin", gateLevel: 13, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of the Ancients", spellName: "Commune with Nature", gateLevel: 17, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of the Ancients", spellName: "Tree Stride", gateLevel: 17, castingAbility: "charisma" },

  // Oath of Vengeance (Paladin) — CHA, gated 3/5/9/13/17.
  { className: "Paladin", subclassName: "Oath of Vengeance", spellName: "Bane", gateLevel: 3, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Vengeance", spellName: "Hunter's Mark", gateLevel: 3, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Vengeance", spellName: "Hold Person", gateLevel: 5, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Vengeance", spellName: "Misty Step", gateLevel: 5, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Vengeance", spellName: "Haste", gateLevel: 9, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Vengeance", spellName: "Protection from Energy", gateLevel: 9, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Vengeance", spellName: "Banishment", gateLevel: 13, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Vengeance", spellName: "Dimension Door", gateLevel: 13, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Vengeance", spellName: "Hold Monster", gateLevel: 17, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Vengeance", spellName: "Scrying", gateLevel: 17, castingAbility: "charisma" },

  // Life Domain (Cleric) — WIS, gated 3/3/5/7/9 (#1128).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Bless", gateLevel: 3, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Cure Wounds", gateLevel: 3, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Lesser Restoration", gateLevel: 3, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Spiritual Weapon", gateLevel: 3, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Beacon of Hope", gateLevel: 5, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Revivify", gateLevel: 5, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Death Ward", gateLevel: 7, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Guardian of Faith", gateLevel: 7, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Mass Cure Wounds", gateLevel: 9, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Raise Dead", gateLevel: 9, castingAbility: "wisdom" },

  // Trickery Domain (Cleric) — WIS, gated 3/3/5/7/9 (#1128).
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Charm Person", gateLevel: 3, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Disguise Self", gateLevel: 3, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Mirror Image", gateLevel: 3, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Pass without Trace", gateLevel: 3, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Blink", gateLevel: 5, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Dispel Magic", gateLevel: 5, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Dimension Door", gateLevel: 7, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Polymorph", gateLevel: 7, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Dominate Person", gateLevel: 9, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Modify Memory", gateLevel: 9, castingAbility: "wisdom" },

  // The Fiend (Warlock) — CHA, gated 3/3/5/7/9 (#1128).
  { className: "Warlock", subclassName: "The Fiend", spellName: "Burning Hands", gateLevel: 3, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Command", gateLevel: 3, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Blindness/Deafness", gateLevel: 3, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Scorching Ray", gateLevel: 3, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Fireball", gateLevel: 5, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Stinking Cloud", gateLevel: 5, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Fire Shield", gateLevel: 7, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Wall of Fire", gateLevel: 7, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Flame Strike", gateLevel: 9, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Hallow", gateLevel: 9, castingAbility: "charisma" },

  // The Archfey (Warlock) — CHA, gated 3/3/5/7/9 (#1128).
  { className: "Warlock", subclassName: "The Archfey", spellName: "Faerie Fire", gateLevel: 3, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Sleep", gateLevel: 3, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Calm Emotions", gateLevel: 3, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Phantasmal Force", gateLevel: 3, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Blink", gateLevel: 5, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Plant Growth", gateLevel: 5, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Dominate Beast", gateLevel: 7, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Greater Invisibility", gateLevel: 7, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Dominate Person", gateLevel: 9, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Archfey", spellName: "Seeming", gateLevel: 9, castingAbility: "charisma" },

  // The Great Old One (Warlock) — CHA, gated 3/3/5/7/9 (#1128).
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Dissonant Whispers", gateLevel: 3, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Hideous Laughter", gateLevel: 3, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Detect Thoughts", gateLevel: 3, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Phantasmal Force", gateLevel: 3, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Clairvoyance", gateLevel: 5, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Sending", gateLevel: 5, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Dominate Beast", gateLevel: 7, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Black Tentacles", gateLevel: 7, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Dominate Person", gateLevel: 9, castingAbility: "charisma" },
  { className: "Warlock", subclassName: "The Great Old One", spellName: "Telekinesis", gateLevel: 9, castingAbility: "charisma" },
];
