// PHB'14 spells offered to three or more of the eight classes above (the
// "3+-list" bucket) — kept in one file instead of duplicated across every
// class file that offers it. A by-class content slice fills this in. #1710
// (foundation slice 1/3 of epic #1517) creates the empty array + wiring only.
import type { CatalogSpell } from "../spells.js";

export const SHARED_SPELLS_2014: CatalogSpell[] = [];
