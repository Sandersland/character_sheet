// Untagged rows default to EDITION_2014 here so a content author's forgotten
// `edition` tag can't silently fall through to CatalogSpell's other default
// (EDITION_2024) and collide with the 2024 row of the same name. An explicit
// `edition` on an individual row still passes through untouched.
import type { CatalogSpell } from "../spells.js";
import { WIZARD_SPELLS_2014 } from "./wizard.js";
import { CLERIC_SPELLS_2014 } from "./cleric.js";
import { DRUID_SPELLS_2014 } from "./druid.js";
import { BARD_SPELLS_2014 } from "./bard.js";
import { SORCERER_SPELLS_2014 } from "./sorcerer.js";
import { WARLOCK_SPELLS_2014 } from "./warlock.js";
import { PALADIN_SPELLS_2014 } from "./paladin.js";
import { RANGER_SPELLS_2014 } from "./ranger.js";
import { SHARED_SPELLS_2014 } from "./shared.js";

const ALL_2014_SPELLS: CatalogSpell[] = [
  ...WIZARD_SPELLS_2014,
  ...CLERIC_SPELLS_2014,
  ...DRUID_SPELLS_2014,
  ...BARD_SPELLS_2014,
  ...SORCERER_SPELLS_2014,
  ...WARLOCK_SPELLS_2014,
  ...PALADIN_SPELLS_2014,
  ...RANGER_SPELLS_2014,
  ...SHARED_SPELLS_2014,
];

export const SPELLS_2014: CatalogSpell[] = ALL_2014_SPELLS.map((spell) => ({
  ...spell,
  edition: spell.edition ?? "EDITION_2014",
}));
