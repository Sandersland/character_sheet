import { z } from "zod";

import { SKILLS } from "./alignments.js";
import { ABILITY_NAMES } from "./species-ability-increases.js";

// A trait row carries at most one of these — unlike abilityIncreasesSchema's array, always exactly one mechanic.
const SKILL_NAMES = SKILLS.map((s) => s.name) as [string, ...string[]];

const chooseSkillsSchema = z
  .object({
    chooseSkills: z
      .object({
        count: z.number().int().positive(),
        // Omitted = any of the 18 skills is eligible — SRD 5.1 places no restriction on Half-Elf's two skills.
        from: z.array(z.enum(SKILL_NAMES)).min(1).optional(),
      })
      .strict(),
  })
  .strict();

const chooseCantripSchema = z
  .object({
    chooseCantrip: z
      .object({
        // Lowercase, matching SpellClass.className's own stored case.
        list: z.string().min(1).optional(),
        // Matched by Spell.name in resolveSpeciesCantripGrant; mutually exclusive with `list`.
        spells: z.array(z.string().min(1)).min(1).optional(),
        // Absent = player picks Int/Wis/Cha at creation; present pins a fixed ability.
        castingAbility: z.enum(ABILITY_NAMES).optional(),
      })
      .strict()
      // #1756: exactly one of list/spells — a class list OR a named set, never both and never neither.
      .refine((c) => (c.list == null) !== (c.spells == null), {
        message: "chooseCantrip must carry exactly one of `list` or `spells`",
      }),
  })
  .strict();

const chooseOriginFeatSchema = z
  .object({
    chooseOriginFeat: z.literal(true),
  })
  .strict();

export const speciesTraitChoiceSchema = z.union([chooseSkillsSchema, chooseCantripSchema, chooseOriginFeatSchema]);

export type SpeciesTraitChoice = z.infer<typeof speciesTraitChoiceSchema>;
export type ChooseSkills = Extract<SpeciesTraitChoice, { chooseSkills: unknown }>["chooseSkills"];
export type ChooseCantrip = Extract<SpeciesTraitChoice, { chooseCantrip: unknown }>["chooseCantrip"];

export function isChooseSkills(choice: SpeciesTraitChoice): choice is { chooseSkills: ChooseSkills } {
  return "chooseSkills" in choice;
}

export function isChooseCantrip(choice: SpeciesTraitChoice): choice is { chooseCantrip: ChooseCantrip } {
  return "chooseCantrip" in choice;
}

// Shared by resolveCastingAbility (create path) and needsCastingAbility (reference serialization) so the "player must choose" predicate can't drift.
export function chooseCantripNeedsPlayerAbility(spec: ChooseCantrip | null): boolean {
  return spec != null && spec.castingAbility == null;
}

export function isChooseOriginFeat(choice: SpeciesTraitChoice): choice is { chooseOriginFeat: true } {
  return "chooseOriginFeat" in choice;
}
