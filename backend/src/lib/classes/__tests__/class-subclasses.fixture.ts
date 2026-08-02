// Classes whose CLASS_FEATURES rows are literal seed data (#1227,
// backend/prisma/seed/fighter-features.ts; #1223,
// backend/prisma/seed/barbarian-features.ts; #1230,
// backend/prisma/seed/ranger-features.ts; #1231,
// backend/prisma/seed/rogue-features.ts; #1233,
// backend/prisma/seed/warlock-features.ts; #1234,
// backend/prisma/seed/wizard-features.ts; #1232,
// backend/prisma/seed/sorcerer-features.ts; #1225,
// backend/prisma/seed/cleric-features.ts; #1224,
// backend/prisma/seed/bard-features.ts; #1226,
// backend/prisma/seed/druid-features.ts), keyed lowercase to match this
// file's own registry convention — the sibling of prisma/seed/class-
// features.ts's LITERAL_ROW_CLASSES (Title Case, "Fighter", "Barbarian",
// "Bard", "Cleric", "Druid", "Ranger", "Rogue", "Sorcerer", "Warlock",
// "Wizard"). Kept as a SECOND constant rather than importing the prisma-side
// one directly: backend/tsconfig.json's `rootDir: "src"` makes any src file
// importing something under prisma/ a compile error (TS6059, verified
// empirically) — there is no single set both sides can share. Both must be
// updated together when a class's rows go literal; class-feature-parity.test.ts
// and feature-edition.test.ts key off THIS one so there is still only one
// hand-maintained list per side, never one per test.
export const LITERAL_ROW_CLASSES = new Set([
  "fighter",
  "barbarian",
  "bard",
  "cleric",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
  "druid",
]);

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
