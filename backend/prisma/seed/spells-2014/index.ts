// Concatenates every per-class 2014 spell-content module into one union and
// defaults untagged rows to EDITION_2014 — the whole spells-2014/ subtree is
// PHB'14 content, so defaulting it here once (rather than repeating
// `edition: "EDITION_2014"` on every future spell literal) is what keeps a
// content author's forgotten tag from silently falling through to
// CatalogSpell's OTHER default (spells.ts's EDITION_2024) and colliding with
// the 2024 row under the same name. An explicit `edition` on an individual
// row (e.g. a genuinely edition-agnostic spell) still passes through
// untouched.
//
// #1710 (foundation slice 1/3 of epic #1517) creates this file plus the
// empty per-class arrays it concatenates; the by-class content slices
// (#1713-#1721) each fill exactly one of those files, never this one — the
// whole point of the split is that they touch disjoint files and merge
// without colliding.
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
