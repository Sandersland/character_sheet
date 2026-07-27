// Every class/subclass pair, shared by class-features-snapshot.test.ts and
// feature-edition.test.ts (#1374) — a plain (non-.test.ts) module so importing
// it for the data never re-executes another file's describe/it blocks (a
// .test.ts import runs top-level test registration as a side effect).
export const CLASS_SUBCLASSES: Record<string, (string | undefined)[]> = {
  barbarian: [undefined, "totem warrior", "berserker"],
  bard: [undefined, "college of lore", "college of valor"],
  cleric: [undefined, "life domain", "trickery domain"],
  druid: [undefined, "circle of the land", "circle of the moon"],
  fighter: [undefined, "battle master", "champion", "eldritch knight"],
  monk: [undefined, "warrior of the open hand", "warrior of shadow", "warrior of the elements", "warrior of mercy"],
  paladin: [undefined, "oath of devotion", "oath of the ancients", "oath of vengeance"],
  ranger: [undefined, "hunter", "beast master"],
  rogue: [undefined, "arcane trickster", "assassin", "thief"],
  sorcerer: [undefined, "draconic bloodline", "wild magic"],
  warlock: [undefined, "the fiend", "the archfey", "the great old one"],
  wizard: [undefined, "school of evocation", "school of abjuration", "school of illusion"],
};
