// Small SRD-derived rules tables + pure derivation helpers used by character
// creation. This is the backend's only home for this data — mirrors how
// src/lib/leveling/experience.ts is the only place the XP table lives. The frontend
// must not duplicate these tables; it gets the catalog data it needs (race
// speed, class hit die, etc.) from GET /api/reference and the 18-skill
// ability mapping from its own existing frontend/src/lib/abilities.ts
// SKILL_LABELS (display-only, no rules logic).
//
// This file is a barrel: the rules tables themselves live in topical files
// alongside it (alignments, tools, condition-data, item-rarity,
// armor-class, movement, extra-attack, spellcasting-tables,
// math, advancement-slots, proficiencies, weapon-damage, character-derive,
// feats). Import from those files directly for new same-domain code; this
// barrel exists so the ~30 existing importers keep working unchanged.

export * from "@/lib/srd/alignments.js";
export * from "@/lib/srd/tools.js";
export * from "@/lib/srd/condition-data.js";
export * from "@/lib/srd/roll-effects.js";
export * from "@/lib/srd/item-rarity.js";
export * from "@/lib/srd/armor-class.js";
export * from "@/lib/srd/movement.js";
export * from "@/lib/srd/extra-attack.js";
export * from "@/lib/srd/spellcasting-tables.js";
export * from "@/lib/srd/math.js";
export * from "@/lib/srd/advancement-slots.js";
export * from "@/lib/srd/primary-abilities.js";
export * from "@/lib/srd/proficiencies.js";
export * from "@/lib/srd/weapon-damage.js";
export * from "@/lib/srd/character-derive.js";
export * from "@/lib/srd/feats.js";
