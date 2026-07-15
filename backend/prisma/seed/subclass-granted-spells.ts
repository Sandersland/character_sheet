// Content-as-data (#898): the spells each subclass grants for free (always
// prepared). Each row REFERENCES the shared Spell catalog by name (resolved to a
// spellId at seed time) — the spell's text lives once, in the catalog, and is
// never snapshotted here. Adding a subclass's granted spells is adding rows to
// this array; no code changes. Homebrew subclasses will grant spells the same
// way once they own Subclass rows (#911).
//
// The official oath / domain / patron lists are seeded in #913 (and depend on the
// L4–L5 catalog expansion #912); this file currently carries only the Way of
// Shadow grant migrated off the former in-code snapshot, to establish the pattern.

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
];
