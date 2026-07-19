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
}

export const SUBCLASS_GRANTED_SPELLS: SubclassGrantedSpellSeed[] = [
  // Way of Shadow (Monk) — Minor Illusion, migrated from the former in-code
  // MINOR_ILLUSION snapshot in lib/spellcasting/granted-spells.ts (#898).
  {
    className: "Monk",
    subclassName: "Way of Shadow",
    spellName: "Minor Illusion",
    gateLevel: 3,
    castingAbility: "wisdom",
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
