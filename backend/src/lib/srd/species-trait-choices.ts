import { z } from "zod";

import { SKILLS } from "./alignments.js";
import { ABILITY_NAMES } from "./species-ability-increases.js";

// The choice vocabulary for SpeciesTrait.choice (#1689, epic #1518 design Part
// 3 amendment) — sibling of species-ability-increases.ts's AbilityIncreaseSpec,
// same "content is data, zod-validated at seed + create" shape. Two forms
// because the 2014 wave-1 roster needs both:
//   - chooseSkills:  pick `count` distinct skills (optionally restricted to
//                    `from`; absent = any of the 18) — Half-Elf's Skill
//                    Versatility.
//   - chooseCantrip: pick one cantrip from a named class spell list
//                    (`list`, lowercase — matches Spell.classes' own case),
//                    with a FIXED casting ability that need not be the
//                    character's own class ability — High Elf's Cantrip
//                    (Intelligence, regardless of the character's class).
// A trait row carries at most ONE of these (never both — unlike
// abilityIncreasesSchema's array, a single trait is always exactly one
// mechanic), so this is a plain discriminated union, not an array-of.
//
// Not exported: SKILL_NAMES has no cross-file consumer beyond this schema's
// own `from` validation — character-create.ts's skill-choice validator reads
// the resolved spec's `from` (or falls back to the full SKILLS list itself),
// never this constant directly.
const SKILL_NAMES = SKILLS.map((s) => s.name) as [string, ...string[]];

const chooseSkillsSchema = z
  .object({
    chooseSkills: z
      .object({
        count: z.number().int().positive(),
        // Omitted = any of the 18 skills is eligible (Half-Elf's shape — SRD
        // 5.1 places no restriction on which two). Present for a future row
        // that restricts to a named subset (none does yet this wave).
        from: z.array(z.enum(SKILL_NAMES)).min(1).optional(),
      })
      .strict(),
  })
  .strict();

const chooseCantripSchema = z
  .object({
    chooseCantrip: z
      .object({
        // Lowercase class name, matching Spell.classes' own stored case
        // (creationPickError's `row.classes.includes(className)` check) —
        // "wizard" for High Elf, never "Wizard".
        list: z.string().min(1),
        castingAbility: z.enum(ABILITY_NAMES),
      })
      .strict(),
  })
  .strict();

export const speciesTraitChoiceSchema = z.union([chooseSkillsSchema, chooseCantripSchema]);

export type SpeciesTraitChoice = z.infer<typeof speciesTraitChoiceSchema>;
export type ChooseSkills = Extract<SpeciesTraitChoice, { chooseSkills: unknown }>["chooseSkills"];
export type ChooseCantrip = Extract<SpeciesTraitChoice, { chooseCantrip: unknown }>["chooseCantrip"];

export function isChooseSkills(choice: SpeciesTraitChoice): choice is { chooseSkills: ChooseSkills } {
  return "chooseSkills" in choice;
}

export function isChooseCantrip(choice: SpeciesTraitChoice): choice is { chooseCantrip: ChooseCantrip } {
  return "chooseCantrip" in choice;
}
