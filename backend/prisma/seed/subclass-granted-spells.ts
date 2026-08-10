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
// editions); a list that diverges forks into one row per edition. #1626
// retags the Cleric domain / Paladin oath rows below whose 2024 text
// (cleric-features.ts/paladin-features.ts, the authority for each list) names
// a different spell than the 2014 row transcribed here: the existing row
// keeps its spell and gateLevel and becomes EDITION_2014-only, and a NEW
// EDITION_2024 row carries the replacement at the same (already 2024-shifted,
// #1128) gate — the 2014 gate levels are themselves wrong (#1626's "second
// axis"), deliberately deferred to #1372's ungate wave. Every other Cleric/
// Paladin row is unchanged between editions and stays shared. Oath of the
// Ancients/Oath of Vengeance need no change at all (verified against their
// own mirror-sourced 2024 rows). #1631 moved The Fiend's/Archfey's/Great Old
// One's Warlock "Expanded Spell List" rows onto SubclassSpellListExpansion
// entirely — see that seed module's own header: unlike Cleric/Paladin's
// always-prepared domain/oath spells, PHB'14's Warlock patron spells are a
// list-EXPANSION (choosable, still costs a known-spell pick), not a grant, so
// they never belonged in THIS family even before #1626 forked their diverging
// rows. The Fiend's SRD 5.2 "Fiend Spells" (below, EDITION_2024) IS genuinely
// always-prepared — that mechanism fork is real, not just the list.
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
  // #1626: PHB'14 p.87 row, retagged 2014-only — SRD 5.2 swaps this for
  // Shield of Faith (see the EDITION_2024 row below).
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Sanctuary", gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2014" },
  // #1626: SRD 5.2 pp.49-50 "Oath of Devotion Spells" — Shield of Faith
  // replaces Sanctuary at L3 (paladin-features.ts is the authority).
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Shield of Faith", gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2024" },
  // #1626: PHB'14 p.87 row, retagged 2014-only — SRD 5.2 swaps this for Aid
  // (see the EDITION_2024 row below).
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Lesser Restoration", gateLevel: 5, castingAbility: "charisma", edition: "EDITION_2014" },
  // #1626: SRD 5.2 pp.49-50 "Oath of Devotion Spells" — Aid replaces Lesser
  // Restoration at L5 (paladin-features.ts is the authority).
  { className: "Paladin", subclassName: "Oath of Devotion", spellName: "Aid", gateLevel: 5, castingAbility: "charisma", edition: "EDITION_2024" },
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
  // #1626: PHB'14 p.59 row, retagged 2014-only — SRD 5.2 p.40 swaps this for
  // Aid (see the EDITION_2024 row below).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Spiritual Weapon", gateLevel: 3, castingAbility: "wisdom", edition: "EDITION_2014" },
  // #1626: SRD 5.2 p.40 "Life Domain Spells", transcribed verbatim
  // (cleric-features.ts is the authority) — Aid replaces Spiritual Weapon at L3.
  { className: "Cleric", subclassName: "Life Domain", spellName: "Aid", gateLevel: 3, castingAbility: "wisdom", edition: "EDITION_2024" },
  // #1626: PHB'14 p.59 row, retagged 2014-only — SRD 5.2 p.40 swaps this for
  // Mass Healing Word (see the EDITION_2024 row below).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Beacon of Hope", gateLevel: 5, castingAbility: "wisdom", edition: "EDITION_2014" },
  // #1626: SRD 5.2 p.40 "Life Domain Spells" — Mass Healing Word replaces
  // Beacon of Hope at L5.
  { className: "Cleric", subclassName: "Life Domain", spellName: "Mass Healing Word", gateLevel: 5, castingAbility: "wisdom", edition: "EDITION_2024" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Revivify", gateLevel: 5, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Death Ward", gateLevel: 7, castingAbility: "wisdom" },
  // #1626: PHB'14 p.59 row, retagged 2014-only — SRD 5.2 p.40 swaps this for
  // Aura of Life (see the EDITION_2024 row below).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Guardian of Faith", gateLevel: 7, castingAbility: "wisdom", edition: "EDITION_2014" },
  // #1626: SRD 5.2 p.40 "Life Domain Spells" — Aura of Life replaces Guardian
  // of Faith at L7.
  { className: "Cleric", subclassName: "Life Domain", spellName: "Aura of Life", gateLevel: 7, castingAbility: "wisdom", edition: "EDITION_2024" },
  { className: "Cleric", subclassName: "Life Domain", spellName: "Mass Cure Wounds", gateLevel: 9, castingAbility: "wisdom" },
  // #1626: PHB'14 p.59 row, retagged 2014-only — SRD 5.2 p.40 swaps this for
  // Greater Restoration (see the EDITION_2024 row below).
  { className: "Cleric", subclassName: "Life Domain", spellName: "Raise Dead", gateLevel: 9, castingAbility: "wisdom", edition: "EDITION_2014" },
  // #1626: SRD 5.2 p.40 "Life Domain Spells" — Greater Restoration replaces
  // Raise Dead at L9.
  { className: "Cleric", subclassName: "Life Domain", spellName: "Greater Restoration", gateLevel: 9, castingAbility: "wisdom", edition: "EDITION_2024" },

  // Trickery Domain (Cleric) — WIS, gated 3/3/5/7/9 (#1128).
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Charm Person", gateLevel: 3, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Disguise Self", gateLevel: 3, castingAbility: "wisdom" },
  // #1626: PHB'14 p.63 row, retagged 2014-only — the mirror-sourced SRD 5.2
  // list swaps this for Invisibility (see the EDITION_2024 row below).
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Mirror Image", gateLevel: 3, castingAbility: "wisdom", edition: "EDITION_2014" },
  // #1626: mirror-sourced 2024 "Trickery Domain Spells" (owner decision
  // #1225, cleric-features.ts is the authority) — Invisibility replaces
  // Mirror Image at L3.
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Invisibility", gateLevel: 3, castingAbility: "wisdom", edition: "EDITION_2024" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Pass without Trace", gateLevel: 3, castingAbility: "wisdom" },
  // #1626: PHB'14 p.63 row, retagged 2014-only — swapped for Hypnotic Pattern
  // in the 2024 list (see the EDITION_2024 row below).
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Blink", gateLevel: 5, castingAbility: "wisdom", edition: "EDITION_2014" },
  // #1626: mirror-sourced 2024 "Trickery Domain Spells" — Hypnotic Pattern
  // replaces Blink at L5.
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Hypnotic Pattern", gateLevel: 5, castingAbility: "wisdom", edition: "EDITION_2024" },
  // #1626: PHB'14 p.63 row, retagged 2014-only — swapped for Nondetection in
  // the 2024 list (see the EDITION_2024 row below).
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Dispel Magic", gateLevel: 5, castingAbility: "wisdom", edition: "EDITION_2014" },
  // #1626: mirror-sourced 2024 "Trickery Domain Spells" — Nondetection
  // replaces Dispel Magic at L5.
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Nondetection", gateLevel: 5, castingAbility: "wisdom", edition: "EDITION_2024" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Dimension Door", gateLevel: 7, castingAbility: "wisdom" },
  // #1626: PHB'14 p.63 row, retagged 2014-only — swapped for Confusion in the
  // 2024 list (see the EDITION_2024 row below).
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Polymorph", gateLevel: 7, castingAbility: "wisdom", edition: "EDITION_2014" },
  // #1626: mirror-sourced 2024 "Trickery Domain Spells" — Confusion replaces
  // Polymorph at L7.
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Confusion", gateLevel: 7, castingAbility: "wisdom", edition: "EDITION_2024" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Dominate Person", gateLevel: 9, castingAbility: "wisdom" },
  { className: "Cleric", subclassName: "Trickery Domain", spellName: "Modify Memory", gateLevel: 9, castingAbility: "wisdom" },

  // The Fiend (Warlock) — CHA, gated 3/3/5/7/9 (#1128). #1631: 2014's
  // "Expanded Spell List" is a list-EXPANSION, not a free grant (PHB'14 "Add
  // fiend spells to your warlock list") — every one of these 10 spells that
  // ALSO serves 2014 now lives on SubclassSpellListExpansion (EDITION_2014)
  // instead, since The Fiend's Subclass row is edition-SHARED and a NULL
  // SubclassGrantedSpell row here would grant it free to a 2014 character
  // too. All 10 rows below are therefore EDITION_2024-only: SRD 5.2 renamed
  // the feature "Fiend Spells" and made it genuinely always-prepared
  // (warlock-features.ts is the authority for both lists' contents).
  { className: "Warlock", subclassName: "The Fiend", spellName: "Burning Hands", gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Command", gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2024" },
  // #1626: SRD 5.2 pp.75-76 "Fiend Spells", transcribed from the PDF's own
  // table — Suggestion replaces the 2014 list's Blindness/Deafness at L3.
  { className: "Warlock", subclassName: "The Fiend", spellName: "Suggestion", gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Scorching Ray", gateLevel: 3, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Fireball", gateLevel: 5, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Stinking Cloud", gateLevel: 5, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Fire Shield", gateLevel: 7, castingAbility: "charisma", edition: "EDITION_2024" },
  { className: "Warlock", subclassName: "The Fiend", spellName: "Wall of Fire", gateLevel: 7, castingAbility: "charisma", edition: "EDITION_2024" },
  // #1626: SRD 5.2 pp.75-76 "Fiend Spells" — Geas replaces the 2014 list's
  // Flame Strike at L9.
  { className: "Warlock", subclassName: "The Fiend", spellName: "Geas", gateLevel: 9, castingAbility: "charisma", edition: "EDITION_2024" },
  // #1626: SRD 5.2 pp.75-76 "Fiend Spells" — Insect Plague replaces the 2014
  // list's Hallow at L9.
  { className: "Warlock", subclassName: "The Fiend", spellName: "Insect Plague", gateLevel: 9, castingAbility: "charisma", edition: "EDITION_2024" },

  // #1631: The Archfey's and The Great Old One's entire PHB'14 "Expanded
  // Spell List" moved to SubclassSpellListExpansion (EDITION_2014) — see that
  // seed module. Both Subclass rows are EDITION_2014-only already (#1233), so
  // every row here would have been 2014-only regardless; this is the SAME
  // "list-expansion, not a free grant" correction as The Fiend above, not an
  // edition change.

  // Arcane Trickster (Rogue) — Mage Hand grant is edition-INVARIANT (#901).
  // Per rogue-features.ts's own header: no first-party SRD text exists for
  // this subclass in EITHER edition, so it is never cited as "SRD 5.2" — 2014
  // is PHB'14 (page not re-verified for the #1231 migration, pinned byte-
  // identical by rogue-2014-snapshot.test.ts) and 2024 is PHB'24
  // (mirror-sourced; not in SRD 5.2 — SRD 5.2 ships only Thief for Rogue).
  // Both editions grant Mage Hand (plus two more wizard cantrips of the
  // player's choice — a chooser, out of scope for this fixed grant, #901) at
  // the subclass's own gate, which is L3 in both editions (Rogue
  // subclassLevel is 3 in both, #1308, "CLASSES — 2014 subclass gate
  // levels"). ONE shared row: this is a catalog JOIN to the Spell table, not
  // transcribed rules prose, so CLAUDE.md's fork-transcribed-content rule
  // doesn't reach it even though the neighbouring Illusion grant below does.
  { className: "Rogue", subclassName: "Arcane Trickster", spellName: "Mage Hand", gateLevel: 3, castingAbility: "intelligence" },

  // School of Illusion (Wizard) — Minor Illusion forks on gateLevel ONLY
  // (#901). Per wizard-features.ts's own header: PHB'14 p.117 "Improved Minor
  // Illusion" grants it at the subclass's own 2014 pick level (Wizard L2,
  // subclassLevel). PHB'24's renamed "Improved Illusions" (mirror-sourced;
  // not in SRD 5.2 — wizard-features.ts ILLUSION_RAW) still grants it, but at
  // the subclass's 2024-uniform gate (L3) — subclassGateLevel ignores
  // subclassLevel entirely for EDITION_2024. Both editions' text also carries
  // "or a different wizard cantrip if you already know it" — the dedup half
  // of that clause is handled generically by mergeGrantedSpells
  // (serialize/spellcasting.ts, pre-existing: the player's learned copy wins
  // over any subclass grant of the same name); the "different cantrip"
  // replacement CHOICE is a player pick with no app affordance yet and stays
  // out of scope (#901 decision 4). Both rows target the SAME Subclass row:
  // PHB'24 renamed the feature/subclass DISPLAY text but never split the
  // catalog row — wizard-features.ts's 2024 ILLUSION_RAW rows still key off
  // `slug("wizard-school-of-illusion")`, the same slug the 2014 row uses
  // (subclasses.ts has no "Illusionist" row) — so there is nothing here for
  // #1408's slug rekey to fix; the existing (className, subclassName) lookup
  // already resolves both tagged rows onto the one shared Subclass row
  // exactly like Life Domain's Spiritual Weapon/Aid fork above.
  { className: "Wizard", subclassName: "School of Illusion", spellName: "Minor Illusion", gateLevel: 2, castingAbility: "intelligence", edition: "EDITION_2014" },
  { className: "Wizard", subclassName: "School of Illusion", spellName: "Minor Illusion", gateLevel: 3, castingAbility: "intelligence", edition: "EDITION_2024" },
];
