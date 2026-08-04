// Alignment options + the 18-skill/governing-ability mapping (PHB Appendix A /
// the skills table). SKILLS is the canonical mapping implicit in
// prisma/seed.ts's per-character skill arrays; it is internal to lib/srd and
// consumed by character-derive.ts, not re-exported for general use.
// SKILL_KEYS (below) is the one deliberate exception — a flat name-only
// projection reused by the effectBuffs `target` seed validator
// (prisma/seed/class-features.ts, #1686), which needs the 18 skill keys
// without importing the (ability-mapping-carrying) SkillDefinition shape.

export const ALIGNMENTS: readonly string[] = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
];

export interface SkillDefinition {
  name: string;
  ability: string;
}

export const SKILLS: readonly SkillDefinition[] = [
  { name: "acrobatics", ability: "dexterity" },
  { name: "animalHandling", ability: "wisdom" },
  { name: "arcana", ability: "intelligence" },
  { name: "athletics", ability: "strength" },
  { name: "deception", ability: "charisma" },
  { name: "history", ability: "intelligence" },
  { name: "insight", ability: "wisdom" },
  { name: "intimidation", ability: "charisma" },
  { name: "investigation", ability: "intelligence" },
  { name: "medicine", ability: "wisdom" },
  { name: "nature", ability: "intelligence" },
  { name: "perception", ability: "wisdom" },
  { name: "performance", ability: "charisma" },
  { name: "persuasion", ability: "charisma" },
  { name: "religion", ability: "intelligence" },
  { name: "sleightOfHand", ability: "dexterity" },
  { name: "stealth", ability: "dexterity" },
  { name: "survival", ability: "wisdom" },
];

export const SKILL_KEYS: readonly string[] = SKILLS.map((s) => s.name);
