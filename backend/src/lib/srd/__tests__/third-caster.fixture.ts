// Mirrors the seeded EK/Arcane Trickster casterFraction/spellcastingAbility columns (#1531).
import type { SubclassCasterRef } from "@/lib/srd/spellcasting-tables.js";

export const ELDRITCH_KNIGHT: SubclassCasterRef = { casterFraction: "third", spellcastingAbility: "intelligence" };
export const ARCANE_TRICKSTER: SubclassCasterRef = { casterFraction: "third", spellcastingAbility: "intelligence" };

// A real, seeded non-caster subclass (e.g. Champion) has both columns NULL on its Subclass row.
export const NON_CASTER_SUBCLASS: SubclassCasterRef = { casterFraction: null, spellcastingAbility: null };
