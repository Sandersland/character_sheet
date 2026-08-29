import { z } from "zod";

// Three increase forms: fixed (named ability, +amount), choose (pick `count` of `from`/any ability, +amount each), floating (a raw point pool the player assigns across distinct abilities).
// resolveSpeciesGrants (#1681) needs the full six-name list as a choose spec's default eligible set — kept exported even with no other cross-file consumer.
// 2024 species rows are always []; enforced by a test, not by this schema (an empty array is also valid for a 2014 row).
export const ABILITY_NAMES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;

const fixedIncreaseSchema = z
  .object({
    ability: z.enum(ABILITY_NAMES),
    amount: z.number().int().positive(),
  })
  .strict();

const chooseIncreaseSchema = z
  .object({
    choose: z
      .object({
        count: z.number().int().positive(),
        amount: z.number().int().positive(),
        // Omitted = any of the six abilities is eligible (e.g. Half-Elf restricts to the five non-Charisma abilities).
        from: z.array(z.enum(ABILITY_NAMES)).min(1).optional(),
      })
      .strict(),
  })
  .strict();

const floatingIncreaseSchema = z
  .object({
    floating: z.number().int().positive(),
  })
  .strict();

const abilityIncreaseSpecSchema = z.union([
  fixedIncreaseSchema,
  chooseIncreaseSchema,
  floatingIncreaseSchema,
]);

export const abilityIncreasesSchema = z.array(abilityIncreaseSpecSchema);

export type AbilityIncreaseSpec = z.infer<typeof abilityIncreaseSpecSchema>;
// resolveSpeciesGrants (#1681) needs this one sub-shape by name; the fixed/floating forms are narrowed inline off AbilityIncreaseSpec instead.
export type ChooseIncrease = z.infer<typeof chooseIncreaseSchema>["choose"];
