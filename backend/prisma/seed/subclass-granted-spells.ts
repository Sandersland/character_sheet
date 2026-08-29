// Each row references the shared Spell catalog by name (resolved to a
// spellId at seed time); the spell's text is never snapshotted here.
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
  // Omitted = shared (NULL column, granted in both editions, #1625).
  edition?: SeedEdition;
}

export const subclassGrantedSpellSeedSchema = z.object({
  className: z.string().min(1),
  subclassName: z.string().min(1),
  spellName: z.string().min(1),
  gateLevel: z.number().int().positive(),
  castingAbility: z.enum(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]),
  edition: z.enum(["EDITION_2014", "EDITION_2024"]).optional(),
});

export const SUBCLASS_GRANTED_SPELLS: SubclassGrantedSpellSeed[] = [
  {
    className: "Monk",
    subclassName: "Warrior of Shadow",
    spellName: "Minor Illusion",
    gateLevel: 3,
    castingAbility: "wisdom",
    edition: "EDITION_2024",
  },
  // Shadow Arts — PHB'14 pp.79-80 (not in SRD 5.1, #1502).
  {
    className: "Monk",
    subclassName: "Way of Shadow",
    spellName: "Minor Illusion",
    gateLevel: 3,
    castingAbility: "wisdom",
    edition: "EDITION_2014",
  },
  // Manipulate Elements grants Elementalism — SRD 5.2 / PHB'24 (#1247).
  {
    className: "Monk",
    subclassName: "Warrior of the Elements",
    spellName: "Elementalism",
    gateLevel: 3,
    castingAbility: "wisdom",
    edition: "EDITION_2024",
  },

  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Protection from Evil and Good", gateLevel: 3, castingAbility: "charisma" },
  // PHB'14 p.87 (#1626).
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Sanctuary", gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2014" },
  // SRD 5.2 pp.49-50 (#1626).
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Shield of Faith", gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2024" },
  // PHB'14 p.87 (#1626).
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Lesser Restoration", gateLevel: 5, castingAbility: "charisma", edition: "EDITION_2014" },
  // SRD 5.2 pp.49-50 (#1626).
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Aid", gateLevel: 5, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Zone of Truth", gateLevel: 5, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Beacon of Hope", gateLevel: 9, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Dispel Magic", gateLevel: 9, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Freedom of Movement", gateLevel: 13, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Guardian of Faith", gateLevel: 13, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Commune", gateLevel: 17, castingAbility: "charisma" },
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Flame Strike", gateLevel: 17, castingAbility: "charisma" },

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

  { className: "Cleric", subclassName: "Life Domain", spellName: "Bless", gateLevel: 3, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Cure Wounds", gateLevel: 3, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Lesser Restoration", gateLevel: 3, castingAbility: "wisdom" },
  // PHB'14 p.59 (#1626).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Spiritual Weapon", gateLevel: 3, castingAbility: "wisdom", edition: "EDITION_2014" },
  // SRD 5.2 p.40 (#1626).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Aid", gateLevel: 3, castingAbility: "wisdom", edition: "EDITION_2024" },
  // PHB'14 p.59 (#1626).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Beacon of Hope", gateLevel: 5, castingAbility: "wisdom", edition: "EDITION_2014" },
  // SRD 5.2 p.40 (#1626).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Mass Healing Word", gateLevel: 5, castingAbility: "wisdom", edition: "EDITION_2024" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Revivify", gateLevel: 5, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Death Ward", gateLevel: 7, castingAbility: "wisdom" },
  // PHB'14 p.59 (#1626).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Guardian of Faith", gateLevel: 7, castingAbility: "wisdom", edition: "EDITION_2014" },
  // SRD 5.2 p.40 (#1626).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Aura of Life", gateLevel: 7, castingAbility: "wisdom", edition: "EDITION_2024" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Mass Cure Wounds", gateLevel: 9, castingAbility: "wisdom" },
  // PHB'14 p.59 (#1626).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Raise Dead", gateLevel: 9, castingAbility: "wisdom", edition: "EDITION_2014" },
  // SRD 5.2 p.40 (#1626).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Greater Restoration", gateLevel: 9, castingAbility: "wisdom", edition: "EDITION_2024" },

  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Charm Person", gateLevel: 3, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Disguise Self", gateLevel: 3, castingAbility: "wisdom" },
  // PHB'14 p.63 (#1626).
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Mirror Image", gateLevel: 3, castingAbility: "wisdom", edition: "EDITION_2014" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Invisibility", gateLevel: 3, castingAbility: "wisdom", edition: "EDITION_2024" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Pass without Trace", gateLevel: 3, castingAbility: "wisdom" },
  // PHB'14 p.63 (#1626).
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Blink", gateLevel: 5, castingAbility: "wisdom", edition: "EDITION_2014" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Hypnotic Pattern", gateLevel: 5, castingAbility: "wisdom", edition: "EDITION_2024" },
  // PHB'14 p.63 (#1626).
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Dispel Magic", gateLevel: 5, castingAbility: "wisdom", edition: "EDITION_2014" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Nondetection", gateLevel: 5, castingAbility: "wisdom", edition: "EDITION_2024" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Dimension Door", gateLevel: 7, castingAbility: "wisdom" },
  // PHB'14 p.63 (#1626).
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Polymorph", gateLevel: 7, castingAbility: "wisdom", edition: "EDITION_2014" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Confusion", gateLevel: 7, castingAbility: "wisdom", edition: "EDITION_2024" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Dominate Person", gateLevel: 9, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Modify Memory", gateLevel: 9, castingAbility: "wisdom" },

  { className: "Warlock", subclassName: "The Fiend", spellName: "Burning Hands", gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Command", gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2024" },
  // SRD 5.2 pp.75-76 (#1626).
  { className: "Warlock", subclassName: "The Fiend", spellName: "Suggestion", gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Scorching Ray", gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Fireball", gateLevel: 5, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Stinking Cloud", gateLevel: 5, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Fire Shield", gateLevel: 7, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Wall of Fire", gateLevel: 7, castingAbility: "charisma", edition: "EDITION_2024" },
  // SRD 5.2 pp.75-76 (#1626).
  { className: "Warlock", subclassName: "The Fiend", spellName: "Geas", gateLevel: 9, castingAbility: "charisma", edition: "EDITION_2024" },
  // SRD 5.2 pp.75-76 (#1626).
  { className: "Warlock", subclassName: "The Fiend", spellName: "Insect Plague", gateLevel: 9, castingAbility: "charisma", edition: "EDITION_2024" },

  { className: "Rogue", subclassName: "Arcane Trickster", spellName: "Mage Hand", gateLevel: 3, castingAbility: "intelligence" },

  // PHB'14 p.117 (#901).
  { className: "Wizard", subclassName: "School of Illusion", spellName: "Minor Illusion", gateLevel: 2, castingAbility: "intelligence", edition: "EDITION_2014" },
  { className: "Wizard", subclassName: "School of Illusion", spellName: "Minor Illusion", gateLevel: 3, castingAbility: "intelligence", edition: "EDITION_2024" },
];
