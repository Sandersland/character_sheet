// Test-only fixture (#1531 review finding 5): the Eldritch Knight / Arcane
// Trickster Subclass rows' own casterFraction/spellcastingAbility columns —
// what a real Prisma `subclassRef` read of the seeded rows resolves to
// (prisma/seed/subclasses.ts). Production code never matches on a name to
// reach this classification; every spellcasting-tables.ts function takes
// this shape directly. Canonical import path for `SubclassCasterRef` in
// tests, replacing per-file hand-copies that could silently drift apart.
import type { SubclassCasterRef } from "@/lib/srd/spellcasting-tables.js";

export const ELDRITCH_KNIGHT: SubclassCasterRef = { casterFraction: "third", spellcastingAbility: "intelligence" };
export const ARCANE_TRICKSTER: SubclassCasterRef = { casterFraction: "third", spellcastingAbility: "intelligence" };

// A real, seeded non-caster subclass (e.g. Champion) — casterFraction/
// spellcastingAbility are both NULL on its Subclass row. One canonical name
// for what two call sites used to name CHAMPION and NON_CASTER_SUBCLASS.
export const NON_CASTER_SUBCLASS: SubclassCasterRef = { casterFraction: null, spellcastingAbility: null };
